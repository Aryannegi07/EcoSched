#!/bin/sh
# Tests the stdin/stdout protocol that Spring Boot uses. Run from the scheduler/ folder after `make`.
BIN=./ecosched_scheduler
P=0; F=0
check() { # name expected actual
  if [ "$2" = "$3" ]; then P=$((P+1)); echo "  PASS  $1"; else F=$((F+1)); echo "  FAIL  $1"; echo "    want: $2"; echo "    got:  $3"; fi
}
echo "CLI protocol"
STATE='TEAM 1 AVAILABLE
REQUEST 1 3 1000 PENDING -
REQUEST 2 5 1001 PENDING -
REQUEST 3 2 1002 PENDING -
REQUEST 4 4 1003 PENDING -'
OUT=$(echo "$STATE" | $BIN run)
check "run: R2 assigned to team 1 first" "ASSIGN 2 1 5 1001" "$(echo "$OUT" | head -1)"
check "run: summary" "SUMMARY assigned=1 pending=3 available_teams=0 busy_teams=1" "$(echo "$OUT" | tail -1)"
check "run: waiting order R4,R1,R3" "4 1 3" "$(echo "$OUT" | grep WAITING | awk '{printf "%s ", $3}' | sed 's/ $//')"
check "queue order R2,R4,R1,R3" "2 4 1 3" "$(echo "$STATE" | $BIN queue | awk '{printf "%s ", $3}' | sed 's/ $//')"

STATE2='TEAM 1 BUSY
REQUEST 2 5 1001 ASSIGNED 1
REQUEST 1 3 1000 PENDING -
REQUEST 9 10 1500 PENDING -'
OUT=$(echo "$STATE2" | $BIN run)
check "busy team: nothing assigned" "SUMMARY assigned=0 pending=2 available_teams=0 busy_teams=1" "$(echo "$OUT" | tail -1)"
check "complete R2" "COMPLETED 2 1" "$(echo "$STATE2" | $BIN complete 2)"
echo "$STATE2" | $BIN complete 1 >/dev/null; check "complete PENDING request -> exit 3" "3" "$?"
echo "$STATE2" | $BIN complete 77 >/dev/null; check "complete unknown id -> exit 2" "2" "$?"

STATE3='TEAM 1 AVAILABLE
TEAM 2 AVAILABLE
REQUEST 1 5 1000 PENDING -
REQUEST 2 5 900 PENDING -
REQUEST 3 5 1100 PENDING -'
OUT=$(echo "$STATE3" | $BIN run)
check "equal priority: earliest first, two teams" "ASSIGN 2 1 5 900 ASSIGN 1 2 5 1000" "$(echo "$OUT" | grep ASSIGN | tr '\n' ' ' | sed 's/ $//')"

printf 'TEAM 1 AVAILABLE\nREQUEST 1 5 abc PENDING -\n' | $BIN run >/dev/null; check "garbage line -> exit 2" "2" "$?"
printf 'TEAM 1 BUSY\nREQUEST 1 5 1 ASSIGNED 1\nREQUEST 2 5 2 IN_PROGRESS 1\n' | $BIN run >/dev/null; check "team with two active requests -> exit 2" "2" "$?"
printf '' | $BIN run >/dev/null; check "empty state ok" "0" "$?"
$BIN bogus </dev/null >/dev/null; check "unknown command -> exit 2" "2" "$?"
echo; echo "RESULT: $P passed, $F failed"
[ "$F" -eq 0 ]
