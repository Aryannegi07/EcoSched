#!/usr/bin/env bash
# EcoSched API smoke test: calls every endpoint (happy path + error cases) with curl.
# Usage:  ./api-smoke-test.sh [BASE_URL]        (default http://localhost:8080)
# Needs:  bash, curl. The backend must be running and the DB created from schema.sql.
# Safe to re-run: it creates its own uniquely named users/teams (it does not delete anything).

BASE="${1:-http://localhost:8080}"
STAMP="$(date +%s)$RANDOM"
PASS=0; FAIL=0
BODY_FILE="$(mktemp)"; trap 'rm -f "$BODY_FILE"' EXIT

# call METHOD PATH [JSON]  -> sets $STATUS and $BODY
call() {
  local method="$1" path="$2" data="${3:-}"
  if [ -n "$data" ]; then
    STATUS=$(curl -s -o "$BODY_FILE" -w '%{http_code}' -X "$method" -H 'Content-Type: application/json' -d "$data" "$BASE$path")
  else
    STATUS=$(curl -s -o "$BODY_FILE" -w '%{http_code}' -X "$method" "$BASE$path")
  fi
  BODY="$(cat "$BODY_FILE")"
}
# expect "name" STATUS [substring-that-must-be-in-body]
expect() {
  local name="$1" want="$2" needle="${3:-}"
  if [ "$STATUS" = "$want" ] && { [ -z "$needle" ] || [[ "$BODY" == *"$needle"* ]]; }; then
    printf '  PASS  %-58s (HTTP %s)\n' "$name" "$STATUS"; PASS=$((PASS+1))
  else
    printf '  FAIL  %-58s want HTTP %s%s, got %s\n        body: %.200s\n' "$name" "$want" "${needle:+ containing $needle}" "$STATUS" "$BODY"; FAIL=$((FAIL+1))
  fi
}
# json_num KEY -> first numeric value of "KEY":123 in $BODY
json_num() { echo "$BODY" | grep -o "\"$1\":[0-9]*" | head -1 | cut -d: -f2; }

echo "EcoSched smoke test against $BASE"

echo "== USERS =="
call POST /api/users "{\"full_name\":\"Smoke A\",\"email\":\"smoke.a.$STAMP@example.com\",\"phone\":\"9000000001\",\"address\":\"1 Test Road\"}"
expect "POST /api/users (valid)" 201 '"user_id"'; UID_A=$(json_num user_id)
call POST /api/users "{\"full_name\":\"Smoke B\",\"email\":\"smoke.b.$STAMP@example.com\",\"phone\":\"9000000002\",\"address\":\"2 Test Road\"}"
expect "POST /api/users (second user)" 201; UID_B=$(json_num user_id)
call POST /api/users "{\"full_name\":\"Dup\",\"email\":\"smoke.a.$STAMP@example.com\",\"phone\":\"9000000003\",\"address\":\"x\"}"
expect "POST /api/users (duplicate email -> 409)" 409
call POST /api/users '{"full_name":"","email":"bad","phone":"abc","address":""}'
expect "POST /api/users (invalid fields -> 400)" 400 '"field_errors"'
call POST /api/users '{"full_name": "broken json'
expect "POST /api/users (malformed JSON -> 400)" 400
call GET /api/users;                expect "GET /api/users" 200 '"user_id"'
call GET "/api/users/$UID_A";       expect "GET /api/users/{id}" 200 "\"user_id\":$UID_A"
call GET /api/users/999999999;      expect "GET /api/users/{id} (missing -> 404)" 404
call GET /api/users/abc;            expect "GET /api/users/abc (bad id -> 400)" 400

echo "== E-WASTE =="
call POST /api/ewaste "{\"user_id\":$UID_A,\"item_name\":\"Smoke Laptop\",\"category\":\"LAPTOP\",\"weight_kg\":2.5}"
expect "POST /api/ewaste (valid, defaults applied)" 201 '"item_condition":"NON_WORKING"'; ITEM_A=$(json_num item_id)
call POST /api/ewaste "{\"user_id\":$UID_A,\"item_name\":\"Smoke Phone\",\"category\":\"MOBILE\",\"item_condition\":\"DAMAGED\",\"quantity\":2,\"weight_kg\":0.4,\"description\":\"cracked\"}"
expect "POST /api/ewaste (all fields)" 201 '"quantity":2'; ITEM_A2=$(json_num item_id)
call POST /api/ewaste "{\"user_id\":$UID_A,\"item_name\":\"X\",\"category\":\"FRIDGE\",\"weight_kg\":1}"
expect "POST /api/ewaste (invalid category -> 400)" 400
call POST /api/ewaste "{\"user_id\":$UID_A,\"item_name\":\"X\",\"category\":\"LAPTOP\",\"weight_kg\":-5}"
expect "POST /api/ewaste (negative weight -> 400)" 400 '"weight_kg"'
call POST /api/ewaste '{"user_id":999999999,"item_name":"X","category":"LAPTOP","weight_kg":1}'
expect "POST /api/ewaste (unknown user -> 404)" 404
call GET /api/ewaste;               expect "GET /api/ewaste" 200 '"item_id"'
call GET "/api/ewaste/$ITEM_A";     expect "GET /api/ewaste/{id}" 200 "\"item_id\":$ITEM_A"
call GET /api/ewaste/999999999;     expect "GET /api/ewaste/{id} (missing -> 404)" 404

echo "== TEAMS =="
call POST /api/teams "{\"team_name\":\"Smoke Team $STAMP\",\"contact_phone\":\"9100000001\",\"vehicle_number\":\"UK07-ZZ-9999\"}"
expect "POST /api/teams (valid, default AVAILABLE)" 201 '"status":"AVAILABLE"'
call POST /api/teams "{\"team_name\":\"Smoke Busy $STAMP\",\"contact_phone\":\"9100000002\",\"status\":\"BUSY\"}"
expect "POST /api/teams (status BUSY -> 400: only the scheduler marks a team BUSY)" 400
call POST /api/teams "{\"team_name\":\"Smoke Team $STAMP\",\"contact_phone\":\"9100000003\"}"
expect "POST /api/teams (duplicate name -> 409)" 409
call POST /api/teams '{"team_name":"T","contact_phone":"12"}'
expect "POST /api/teams (bad phone -> 400)" 400 '"contact_phone"'
call GET /api/teams;                expect "GET /api/teams" 200 '"team_id"'
[[ "$BODY" == *'"current_task":null'* ]] && { echo "  PASS  teams expose current_task (null while AVAILABLE)"; PASS=$((PASS+1)); } || { echo "  FAIL  teams should expose current_task"; FAIL=$((FAIL+1)); }
TEAM_X=$(echo "$BODY" | grep -o "{[^{}]*Smoke Team $STAMP[^{}]*}" | grep -o '"team_id":[0-9]*' | head -1 | cut -d: -f2)
call PUT "/api/teams/$TEAM_X" "{\"team_name\":\"Smoke Team $STAMP\",\"contact_phone\":\"9100000077\",\"vehicle_number\":\"UK07-ZZ-0001\"}"
expect "PUT /api/teams/{id} (update phone + vehicle)" 200 '"contact_phone":"9100000077"'
call PUT /api/teams/999999999 '{"team_name":"Nobody","contact_phone":"9100000078"}'
expect "PUT /api/teams/{id} (unknown -> 404)" 404
call DELETE "/api/teams/$TEAM_X"
expect "DELETE /api/teams/{id} (idle team without history)" 204
call DELETE "/api/teams/$TEAM_X"
expect "DELETE /api/teams/{id} (already gone -> 404)" 404
call POST /api/teams "{\"team_name\":\"Smoke Team $STAMP\",\"contact_phone\":\"9100000001\",\"vehicle_number\":\"UK07-ZZ-9999\"}"
expect "POST /api/teams (re-create the deleted team)" 201
call GET /api/admin/stats
expect "GET /api/admin/stats" 200 '"total_users"'
[[ "$BODY" == *'"integrity_violations":0'* ]] && { echo "  PASS  admin stats: 0 integrity violations"; PASS=$((PASS+1)); } || { echo "  FAIL  integrity violations in admin stats"; FAIL=$((FAIL+1)); }
call GET /api/admin/ewaste-stats
expect "GET /api/admin/ewaste-stats" 200 '"total_weight_kg"'
call GET /api/teams/available;      expect "GET /api/teams/available (contains new team)" 200 "Smoke Team $STAMP"
if [ "$STATUS" = 200 ] && [[ "$BODY" == *'"status":"AVAILABLE"'* ]] && [[ "$BODY" != *'"status":"BUSY"'* ]]; then echo "  PASS  /api/teams/available lists no BUSY team"; PASS=$((PASS+1)); else echo "  FAIL  /api/teams/available must list AVAILABLE teams only"; FAIL=$((FAIL+1)); fi

echo "== REQUESTS =="
call POST /api/requests "{\"user_id\":$UID_A,\"item_id\":$ITEM_A,\"location\":\"1 Test Road\",\"priority\":10}"
expect "POST /api/requests (valid)" 201 '"status":"PENDING"'; REQ_A=$(json_num request_id)
[[ "$BODY" == *'"team_id":null'* ]] && { echo "  PASS  new request has team_id null"; PASS=$((PASS+1)); } || { echo "  FAIL  new request should have team_id null"; FAIL=$((FAIL+1)); }
call POST /api/requests "{\"user_id\":$UID_A,\"item_id\":$ITEM_A2,\"location\":\"1 Test Road\"}"
expect "POST /api/requests (priority defaults to 1)" 201 '"priority":1'
call POST /api/requests "{\"user_id\":$UID_A,\"item_id\":$ITEM_A,\"location\":\"1 Test Road\"}"
expect "POST /api/requests (item already open -> 409)" 409
call POST /api/requests "{\"user_id\":$UID_B,\"item_id\":$ITEM_A,\"location\":\"2 Test Road\"}"
expect "POST /api/requests (item of another user -> 400)" 400
call POST /api/requests "{\"user_id\":$UID_A,\"item_id\":$ITEM_A,\"location\":\"x\",\"priority\":11}"
expect "POST /api/requests (priority 11 -> 400)" 400 '"priority"'
call POST /api/requests "{\"user_id\":$UID_A,\"item_id\":999999999,\"location\":\"x\"}"
expect "POST /api/requests (unknown item -> 404)" 404
call POST /api/requests "{\"user_id\":999999999,\"item_id\":$ITEM_A,\"location\":\"x\"}"
expect "POST /api/requests (unknown user -> 404)" 404
call POST /api/requests '{"user_id":1}'
expect "POST /api/requests (missing fields -> 400)" 400 '"item_id"'
call GET /api/requests;             expect "GET /api/requests" 200 '"request_id"'
call GET "/api/requests/$REQ_A";    expect "GET /api/requests/{id}" 200 "\"request_id\":$REQ_A"
call GET /api/requests/999999999;   expect "GET /api/requests/{id} (missing -> 404)" 404
call GET /api/requests/pending;     expect "GET /api/requests/pending (contains new request)" 200 "\"request_id\":$REQ_A"
if [ "$STATUS" = 200 ] && [[ "$BODY" == *'"status":"PENDING"'* ]] && [[ "$BODY" != *'"status":"ASSIGNED"'* && "$BODY" != *'"status":"IN_PROGRESS"'* && "$BODY" != *'"status":"COMPLETED"'* && "$BODY" != *'"status":"CANCELLED"'* ]]; then echo "  PASS  /pending contains only PENDING requests"; PASS=$((PASS+1)); else echo "  FAIL  /pending must contain only PENDING requests"; FAIL=$((FAIL+1)); fi
call GET /api/requests/priority;    expect "GET /api/requests/priority" 200 "\"request_id\":$REQ_A"
PRIOS=$(echo "$BODY" | grep -o '"priority":[0-9]*' | cut -d: -f2 | tr '\n' ' ')
if [ "$STATUS" = 200 ] && [ "$(echo $PRIOS | wc -w)" -ge 2 ] && echo "$PRIOS" | awk '{ for (i=2;i<=NF;i++) if ($i>$(i-1)) exit 1 }'; then echo "  PASS  /priority is sorted highest-first ($PRIOS)"; PASS=$((PASS+1)); else echo "  FAIL  /priority not sorted highest-first: $PRIOS"; FAIL=$((FAIL+1)); fi

echo "== FRAMEWORK ERRORS =="
call GET /api/does-not-exist;       expect "unknown URL -> 404" 404
call DELETE /api/users;             expect "unsupported method -> 405" 405

echo
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
