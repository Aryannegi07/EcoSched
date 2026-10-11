#!/usr/bin/env bash
# EcoSched scheduler integration test (real backend + real MySQL + real C scheduler).
# Usage: ./scheduler-test.sh [BASE_URL]      (default http://localhost:8080)
#
# PRECONDITION: the database must contain NO teams and NO requests, because the scheduler works on all
# real data. Reset it with:  mysql -u root -p < database/schema.sql      (do NOT load seed.sql)
# The script then creates its own user, items, teams and requests. It takes ~30 s (it sleeps 1 s between
# requests because request_time has one-second precision and the tie-breaker uses it).

BASE="${1:-http://localhost:8080}"
STAMP="$(date +%s)$RANDOM"
PASS=0; FAIL=0
BODY_FILE="$(mktemp)"; trap 'rm -f "$BODY_FILE"' EXIT

call() {
  local method="$1" path="$2" data="${3:-}"
  if [ -n "$data" ]; then
    STATUS=$(curl -s -o "$BODY_FILE" -w '%{http_code}' -X "$method" -H 'Content-Type: application/json' -d "$data" "$BASE$path")
  else
    STATUS=$(curl -s -o "$BODY_FILE" -w '%{http_code}' -X "$method" "$BASE$path")
  fi
  BODY="$(cat "$BODY_FILE")"
}
ok()   { printf '  PASS  %s\n' "$1"; PASS=$((PASS+1)); }
bad()  { printf '  FAIL  %s\n        status=%s body: %.300s\n' "$1" "$STATUS" "$BODY"; FAIL=$((FAIL+1)); }
check() { # name condition-exit-code
  if [ "$2" -eq 0 ]; then ok "$1"; else bad "$1"; fi
}
json_num() { echo "$BODY" | grep -o "\"$1\":[0-9]*" | head -1 | cut -d: -f2; }
# assigned request ids from a /run response, space separated
assigned_ids() { echo "$BODY" | grep -o '"assignments":\[.*\]' | grep -o '"request_id":[0-9]*' | cut -d: -f2 | tr '\n' ' ' | sed 's/ $//'; }
req_field() { # request_id field-regex -> value from GET /api/requests/{id}
  call GET "/api/requests/$1"; echo "$BODY" | grep -o "\"$2\":[^,}]*" | head -1 | cut -d: -f2 | tr -d '"'
}
team_status() { call GET /api/teams; echo "$BODY" | grep -o "{[^{}]*\"team_id\":$1,[^{}]*}" | grep -o '"status":"[A-Z]*"' | cut -d'"' -f4; }
new_request() { # item_id priority -> id (sleeps 1 s so request_time differs)
  call POST /api/requests "{\"user_id\":$USER_ID,\"item_id\":$1,\"location\":\"Test Road\",\"priority\":$2}"
  [ "$STATUS" = 201 ] || { echo "request creation failed: $BODY" >&2; exit 1; }
  json_num request_id; sleep 1
}
run_sched() { call POST /api/scheduler/run; }

echo "EcoSched scheduler test against $BASE"

echo "== PRECONDITION =="
call GET /api/scheduler/status
[ "$STATUS" = 200 ] || { echo "status endpoint failed ($STATUS): $BODY"; exit 1; }
echo "$BODY" | grep -q '"engine_available":true' || { echo "C scheduler not built. Run: cd scheduler && make"; exit 1; }
call GET /api/requests; [ "$BODY" = "[]" ] || { echo "Database must have no requests. Reset with schema.sql (no seed)."; exit 1; }
call GET /api/teams;    [ "$BODY" = "[]" ] || { echo "Database must have no teams. Reset with schema.sql (no seed)."; exit 1; }

echo "== SETUP =="
call POST /api/users "{\"full_name\":\"Sched Tester\",\"email\":\"sched.$STAMP@example.com\",\"phone\":\"9000000099\",\"address\":\"1 Test Road\"}"
USER_ID=$(json_num user_id)
ITEMS=()
for i in $(seq 1 10); do
  call POST /api/ewaste "{\"user_id\":$USER_ID,\"item_name\":\"Item $i\",\"category\":\"OTHER\",\"weight_kg\":1}"
  ITEMS+=("$(json_num item_id)")
done
call POST /api/teams "{\"team_name\":\"Sched Team 1 $STAMP\",\"contact_phone\":\"9100000011\"}"
T1=$(json_num team_id)
[ -n "$USER_ID" ] && [ -n "$T1" ] && ok "user, 10 items and team 1 created" || { bad "setup"; exit 1; }

echo "== 0. scheduler with an empty queue =="
run_sched
[ "$STATUS" = 200 ] && [ "$(json_num assigned_count)" = 0 ] && ok "run with no pending requests assigns nothing" || bad "empty run"

echo "== 1-6. four requests with priorities 3,5,2,4 and ONE team =="
R1=$(new_request "${ITEMS[0]}" 3); R2=$(new_request "${ITEMS[1]}" 5); R3=$(new_request "${ITEMS[2]}" 2); R4=$(new_request "${ITEMS[3]}" 4)
[ "$(req_field "$R1" status)" = PENDING ] && [ "$(req_field "$R2" status)" = PENDING ] && ok "all four are PENDING" || bad "pending"
call GET /api/scheduler/queue
ORDER=$(echo "$BODY" | grep -o '"request_id":[0-9]*' | cut -d: -f2 | tr '\n' ' ' | sed 's/ $//')
[ "$ORDER" = "$R2 $R4 $R1 $R3" ] && ok "queue order is R2,R4,R1,R3 ($ORDER)" || { STATUS=$STATUS; bad "queue order: got '$ORDER' want '$R2 $R4 $R1 $R3'"; }

run_sched
[ "$STATUS" = 200 ] && [ "$(assigned_ids)" = "$R2" ] && ok "run assigns only R2 (priority 5)" || bad "first run"
[ "$(req_field "$R2" status)" = ASSIGNED ] && ok "DB: R2 is ASSIGNED" || bad "R2 status"
[ "$(req_field "$R2" team_id)" = "$T1" ] && ok "DB: R2 has team_id of team 1" || bad "R2 team"
[ "$(team_status "$T1")" = BUSY ] && ok "DB: team 1 is BUSY" || bad "team 1 BUSY"
[ "$(req_field "$R4" status)" = PENDING ] && ok "DB: R4 is still PENDING" || bad "R4 pending"

echo "== 12. all teams busy =="
run_sched
[ "$STATUS" = 200 ] && [ "$(json_num assigned_count)" = 0 ] && ok "run with busy team assigns nothing" || bad "busy run"
[ "$(req_field "$R2" status)" = ASSIGNED ] && ok "R2 unchanged" || bad "R2 changed"

echo "== non-preemptive: urgent request arrives while team 1 is busy =="
R5=$(new_request "${ITEMS[4]}" 10)
run_sched
[ "$(json_num assigned_count)" = 0 ] && [ "$(req_field "$R2" status)" = ASSIGNED ] && [ "$(req_field "$R2" team_id)" = "$T1" ] \
  && ok "priority-10 request did NOT interrupt R2" || bad "preemption happened"
[ "$(req_field "$R5" status)" = PENDING ] && ok "priority-10 request waits as PENDING" || bad "R5 pending"

echo "== 7-10. complete, then run again =="
call PUT "/api/requests/$R1/complete"; [ "$STATUS" = 409 ] && ok "completing a PENDING request -> 409" || bad "complete pending"
call PUT "/api/requests/999999999/complete"; [ "$STATUS" = 404 ] && ok "completing unknown request -> 404" || bad "complete unknown"
call PUT "/api/requests/$R2/complete"
[ "$STATUS" = 200 ] && [ "$(req_field "$R2" status)" = COMPLETED ] && ok "R2 is COMPLETED" || bad "complete R2"
[ "$(team_status "$T1")" = AVAILABLE ] && ok "DB: team 1 is AVAILABLE again" || bad "team 1 available"
call PUT "/api/requests/$R2/complete"; [ "$STATUS" = 409 ] && ok "completing twice -> 409" || bad "complete twice"
run_sched
[ "$(assigned_ids)" = "$R5" ] && ok "next selected: R5 (priority 10)" || bad "next selection"
for expect in "$R4" "$R1" "$R3"; do
  call GET /api/requests; cur=$(echo "$BODY" | grep -o '"request_id":[0-9]*,[^}]*"status":"ASSIGNED"' | head -1 | grep -o '^"request_id":[0-9]*' | cut -d: -f2)
  call PUT "/api/requests/$cur/complete"
  run_sched
  [ "$(assigned_ids)" = "$expect" ] && ok "then R$expect is selected" || bad "expected $expect, got '$(assigned_ids)'"
done
call GET /api/requests; cur=$(echo "$BODY" | grep -o '"request_id":[0-9]*,[^}]*"status":"ASSIGNED"' | head -1 | grep -o '^"request_id":[0-9]*' | cut -d: -f2)
call PUT "/api/requests/$cur/complete"

echo "== 11. equal priorities: earlier request_time first =="
E1=$(new_request "${ITEMS[0]}" 6); E2=$(new_request "${ITEMS[1]}" 6); E3=$(new_request "${ITEMS[2]}" 6)
for expect in "$E1" "$E2" "$E3"; do
  run_sched
  [ "$(assigned_ids)" = "$expect" ] && ok "equal priority: $expect selected in request_time order" || bad "tie-break: want $expect got '$(assigned_ids)'"
  call PUT "/api/requests/$expect/complete"
done

echo "== 13-14. 10 requests, 2 teams =="
call POST /api/teams "{\"team_name\":\"Sched Team 2 $STAMP\",\"contact_phone\":\"9100000012\"}"
T2=$(json_num team_id)
PRIOS=(3 5 2 4 5 1 9 7 7 6)
for i in $(seq 0 9); do new_request "${ITEMS[$i]}" "${PRIOS[$i]}" >/dev/null; done
run_sched
[ "$(json_num assigned_count)" = 2 ] && ok "exactly 2 requests assigned (2 teams)" || bad "assigned_count"
[ "$(json_num pending_count)" = 8 ] && ok "8 requests remain PENDING" || bad "pending_count"
call GET /api/requests/pending
[ "$(echo "$BODY" | grep -o '"request_id"' | wc -l | tr -d ' ')" = 8 ] && ok "DB: 8 PENDING rows" || bad "pending rows"
call GET /api/requests
ACTIVE_TEAMS=$(echo "$BODY" | grep -o '"status":"\(ASSIGNED\|IN_PROGRESS\)","team_id":[0-9]*' | grep -o 'team_id":[0-9]*' | sort)
[ "$(echo "$ACTIVE_TEAMS" | wc -l | tr -d ' ')" = 2 ] && [ -z "$(echo "$ACTIVE_TEAMS" | uniq -d)" ] \
  && ok "2 active requests, each on a different team (no team has two)" || bad "active requests per team: $ACTIVE_TEAMS"
run_sched
[ "$(json_num assigned_count)" = 0 ] && ok "second run assigns nothing while both teams are busy" || bad "second run"

echo "== Chat 4: current_task, start, cancel, integrity, admin stats =="
call GET /api/teams
[ "$(echo "$BODY" | grep -o '"current_task":[0-9]*' | wc -l | tr -d ' ')" = 2 ] && ok "both BUSY teams carry a current_task" || bad "current_task on busy teams"
call GET /api/scheduler/status
echo "$BODY" | grep -q '"integrity_violations":0' && ok "status: integrity_violations = 0 (requests and teams agree)" || bad "integrity violations"
echo "$BODY" | grep -q '"last_run":{' && ok "status: last_run is kept by the backend" || bad "last_run missing"
call GET /api/requests; cur=$(echo "$BODY" | grep -o '"request_id":[0-9]*,[^}]*"status":"ASSIGNED"' | head -1 | grep -o '^"request_id":[0-9]*' | cut -d: -f2)
call PUT "/api/requests/$cur/start"
[ "$STATUS" = 200 ] && [ "$(req_field "$cur" status)" = IN_PROGRESS ] && ok "start: ASSIGNED -> IN_PROGRESS" || bad "start"
call PUT "/api/requests/$cur/start"; [ "$STATUS" = 409 ] && ok "start twice -> 409" || bad "start twice"
call PUT "/api/requests/$cur/cancel"
[ "$STATUS" = 200 ] && [ "$(req_field "$cur" status)" = CANCELLED ] && ok "cancel: IN_PROGRESS -> CANCELLED" || bad "cancel"
call GET /api/scheduler/status
[ "$(json_num busy_teams)" = 1 ] && ok "cancel released the team in the same transaction (1 team BUSY now)" || bad "busy_teams after cancel"
echo "$BODY" | grep -q '"integrity_violations":0' && ok "integrity still 0 after cancel" || bad "integrity after cancel"
call PUT "/api/requests/$cur/cancel"; [ "$STATUS" = 409 ] && ok "cancelling a CANCELLED request -> 409" || bad "cancel twice"
call GET /api/admin/stats
[ "$STATUS" = 200 ] && echo "$BODY" | grep -q '"busy_teams":1' && ok "admin stats agree: 1 busy team" || bad "admin stats"

echo
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
