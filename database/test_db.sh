#!/usr/bin/env bash
# EcoSched database test: constraints, transactions, integrity view.
# Usage:  MYSQL_PWD='your_root_password' ./database/test_db.sh -u root
#         (do not use -p: the script calls mysql ~50 times and would ask for the password every time)
# It RE-CREATES the ecosched database (schema + seed + procedures). Do not run on data you want to keep.
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
MYSQL_OPTS=("$@")
PASS=0; FAIL=0
m() { mysql "${MYSQL_OPTS[@]}" ecosched -N -B -e "$1" 2>&1 | grep -v 'Using a password on the command line'; }

mysql "${MYSQL_OPTS[@]}" < "$DIR/schema.sql" && mysql "${MYSQL_OPTS[@]}" ecosched < "$DIR/seed.sql" \
  && mysql "${MYSQL_OPTS[@]}" ecosched < "$DIR/procedures.sql" || { echo "could not load SQL files"; exit 1; }

expect_ok()    { local out; out=$(m "$2"); if echo "$out" | grep -q '^ERROR'; then echo "  FAIL  $1: $out"; FAIL=$((FAIL+1)); else echo "  PASS  $1"; PASS=$((PASS+1)); fi; }
expect_error() { local out; out=$(m "$2"); if echo "$out" | grep -q '^ERROR'; then echo "  PASS  $1  [$(echo "$out" | head -1 | cut -c1-90)]"; PASS=$((PASS+1)); else echo "  FAIL  $1 (statement was accepted!)"; FAIL=$((FAIL+1)); fi; }
expect_eq()    { local out; out=$(m "$2"); if [ "$out" = "$3" ]; then echo "  PASS  $1"; PASS=$((PASS+1)); else echo "  FAIL  $1: expected '$3' got '$out'"; FAIL=$((FAIL+1)); fi; }

echo "== seed data is consistent =="
expect_eq "integrity view is empty after seeding" "SELECT COUNT(*) FROM v_integrity_violations" "0"
expect_eq "4 pending / 1 assigned / 1 in progress / 1 completed" \
  "SELECT CONCAT(SUM(status='PENDING'),'/',SUM(status='ASSIGNED'),'/',SUM(status='IN_PROGRESS'),'/',SUM(status='COMPLETED')) FROM pickup_requests" "4/1/1/1"

echo "== constraints reject bad data =="
expect_error "duplicate email (UNIQUE)"        "INSERT INTO users (full_name,email,phone,address) VALUES ('X','riya.sharma@example.com','9876500077','a')"
expect_error "bad phone (CHECK)"               "INSERT INTO users (full_name,email,phone,address) VALUES ('X','x1@example.com','123','a')"
expect_error "NULL name (NOT NULL)"            "INSERT INTO users (full_name,email,phone,address) VALUES (NULL,'x2@example.com','9876500077','a')"
expect_error "e-waste with unknown user (FK)"  "INSERT INTO e_waste (user_id,item_name,category,weight_kg) VALUES (999,'x','OTHER',1)"
expect_error "e-waste weight 0 (CHECK)"        "INSERT INTO e_waste (user_id,item_name,category,weight_kg) VALUES (1,'x','OTHER',0)"
expect_error "e-waste bad category (CHECK)"    "INSERT INTO e_waste (user_id,item_name,category,weight_kg) VALUES (1,'x','TOASTER',1)"
expect_error "priority 11 (CHECK)"             "INSERT INTO pickup_requests (user_id,item_id,location,priority) VALUES (1,2,'x',11)"
expect_error "request for someone else's item (composite FK)" "INSERT INTO pickup_requests (user_id,item_id,location,priority) VALUES (1,3,'x',5)"
expect_error "PENDING request that already has a team (CHECK)" "INSERT INTO pickup_requests (user_id,item_id,team_id,location,priority,status) VALUES (3,5,3,'x',5,'PENDING')"
expect_error "ASSIGNED request without team (CHECK)" "UPDATE pickup_requests SET status='ASSIGNED' WHERE request_id=1"
expect_error "duplicate team name (UNIQUE)"    "INSERT INTO collection_teams (team_name,contact_phone) VALUES ('Green Squad Alpha','9811100077')"
expect_error "delete a user who has requests (FK RESTRICT)" "DELETE FROM users WHERE user_id=1"
expect_error "delete a team that has requests (FK RESTRICT)" "DELETE FROM collection_teams WHERE team_id=1"

echo "== the inconsistent states from the project brief are impossible =="
expect_error "team BUSY without current_task (CHECK)"      "UPDATE collection_teams SET status='BUSY' WHERE team_id=3"
expect_error "team AVAILABLE but keeps current_task (CHECK)" "UPDATE collection_teams SET status='AVAILABLE' WHERE team_id=1"
# Isolate the composite FK: request 1 belongs to team 3, but team 3 is released (allowed by the DB, see docs)
# so that the UNIQUE(current_task) rule is NOT the one that fires; then team 4 tries to claim request 1.
out=$(mysql "${MYSQL_OPTS[@]}" ecosched -N -B --force 2>&1 <<'SQL'
START TRANSACTION;
UPDATE pickup_requests SET team_id=3, status='ASSIGNED' WHERE request_id=1;
UPDATE collection_teams SET status='BUSY', current_task=1 WHERE team_id=4;
ROLLBACK;
SQL
)
if echo "$out" | grep -q 'ERROR 1452'; then echo "  PASS  team 4 cannot claim a request owned by team 3 (composite FK)  [$(echo "$out" | head -1 | cut -c1-80)]"; PASS=$((PASS+1)); else echo "  FAIL  composite FK: $out"; FAIL=$((FAIL+1)); fi
expect_error "team 3 BUSY on a PENDING request (trigger)"   "UPDATE collection_teams SET status='BUSY', current_task=1 WHERE team_id=3"
expect_error "two teams on one request (UNIQUE current_task)" "UPDATE collection_teams SET status='BUSY', current_task=4 WHERE team_id=2"
expect_error "team 1 gets a 2nd active request (UNIQUE active_team_id)" "UPDATE pickup_requests SET team_id=1, status='ASSIGNED' WHERE request_id=1"
expect_error "finish request 4 while team 1 still lists it (trigger)" "UPDATE pickup_requests SET status='COMPLETED' WHERE request_id=4"
expect_error "finish request 5 without releasing team 2"    "UPDATE pickup_requests SET status='CANCELLED' WHERE request_id=5"
expect_eq "nothing above changed the data" "SELECT COUNT(*) FROM v_integrity_violations" "0"

echo "== transactions =="
expect_ok  "sp_assign_request(1,3) commits" "CALL sp_assign_request(1,3)"
expect_eq  "request 1 ASSIGNED to team 3" "SELECT CONCAT(status,'/',team_id) FROM pickup_requests WHERE request_id=1" "ASSIGNED/3"
expect_eq  "team 3 BUSY with current_task 1" "SELECT CONCAT(status,'/',current_task) FROM collection_teams WHERE team_id=3" "BUSY/1"
expect_error "assigning to a BUSY team is refused" "CALL sp_assign_request(3,3)"
expect_error "assigning a non-PENDING request is refused" "CALL sp_assign_request(1,4)"
expect_eq  "refused calls changed nothing (request 3 still PENDING, team 4 AVAILABLE)" \
  "SELECT CONCAT((SELECT status FROM pickup_requests WHERE request_id=3),'/',(SELECT status FROM collection_teams WHERE team_id=4))" "PENDING/AVAILABLE"
# rollback: steps 1 and 2 succeed, step 3 fails, ROLLBACK must undo steps 1 and 2 as well
out=$(mysql "${MYSQL_OPTS[@]}" ecosched -N -B --force 2>&1 <<'SQL'
START TRANSACTION;
UPDATE pickup_requests SET team_id=4, status='ASSIGNED' WHERE request_id=3;
SELECT CONCAT('inside txn: request 3 = ', status) FROM pickup_requests WHERE request_id=3;
UPDATE collection_teams SET status='BUSY', current_task=1 WHERE team_id=4;
ROLLBACK;
SELECT CONCAT('after rollback: request 3 = ', status, ', team_id = ', IFNULL(team_id,'NULL')) FROM pickup_requests WHERE request_id=3;
SQL
)
if echo "$out" | grep -q 'inside txn: request 3 = ASSIGNED' && echo "$out" | grep -q 'ERROR' && echo "$out" | grep -q 'after rollback: request 3 = PENDING, team_id = NULL'; then
  echo "  PASS  failed step 3 + ROLLBACK also undid steps 1-2 (request 3 back to PENDING, no team)"; PASS=$((PASS+1))
else echo "  FAIL  rollback test: $out"; FAIL=$((FAIL+1)); fi
expect_ok  "sp_complete_request(1) commits" "CALL sp_complete_request(1)"
expect_eq  "request 1 COMPLETED, keeps team_id 3 as history" "SELECT CONCAT(status,'/',team_id) FROM pickup_requests WHERE request_id=1" "COMPLETED/3"
expect_eq  "team 3 AVAILABLE, current_task NULL" "SELECT CONCAT(status,'/',IFNULL(current_task,'NULL')) FROM collection_teams WHERE team_id=3" "AVAILABLE/NULL"
expect_error "completing a PENDING request is refused" "CALL sp_complete_request(2)"
expect_eq  "integrity view empty at the end" "SELECT COUNT(*) FROM v_integrity_violations" "0"

echo "== index is used by the scheduler query =="
PLAN=$(m "EXPLAIN SELECT request_id FROM pickup_requests WHERE status='PENDING' ORDER BY priority DESC, request_time ASC")
if echo "$PLAN" | grep -q 'idx_requests_status_priority_time'; then echo "  PASS  EXPLAIN uses idx_requests_status_priority_time"; PASS=$((PASS+1)); else echo "  FAIL  index not used: $PLAN"; FAIL=$((FAIL+1)); fi
echo "$PLAN" | cut -f2-12 | sed 's/^/        /'

echo
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
