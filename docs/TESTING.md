# EcoSched - Testing

All numbers below come from real runs. Raw output is stored in `docs/test-results/`.

**Test environment of the runs below:** Ubuntu 24.04, MySQL 8.0.46, gcc 13.3, OpenJDK 21, Node 22.
Every MySQL, C and frontend-build test ran against the real thing.

## 1. Summary

| Layer | Test | Result | Real component(s) used |
|-------|------|--------|------------------------|
| C scheduler unit tests | `cd scheduler && make test` | **40 / 40** pass | C binary |
| C scheduler CLI protocol | same command (second half) | **13 / 13** pass | C binary |
| MySQL schema, constraints, triggers, procedures, transactions, index | `database/test_db.sh` | **37 / 37** pass | MySQL 8.0.46 |
| OS <-> DBMS workflow (incl. 6 concurrent scheduler runs) | `database/workflow_test.py` | **32 / 32** pass | MySQL + C binary |
| **Phase-1 scenario test** (3 users, 5 items, 5 requests, 2 teams) | `database/scenario_test.py` | **55 / 55** pass | MySQL + C binary |
| Frontend production build | `cd frontend && npm run build` | OK (203 kB JS, built in ~13 s) | Vite, Node 22 |
| Frontend -> API URL check | every path in `frontend/src/api.js` compared with the `@...Mapping` of the controllers | all 23 calls match a controller route | static comparison |
| **Spring Boot build + run** | `mvn clean package`, `mvn spring-boot:run` | **NOT RUN** (see section 6) | - |
| **REST API tests** | `backend/scripts/api-smoke-test.sh`, `scheduler-test.sh` | **NOT RUN** | - |
| **Browser test against Spring Boot** | manual steps in section 5 | **NOT RUN** | - |

Important: `scenario_test.py` and `workflow_test.py` re-implement the Java `SchedulerService` in Python
(same SQL statements, same lock order, same C program). They prove the **database design, the C scheduler and the
statement sequence**. They do **not** execute any Java code.

## 2. Phase-1 scenario test (`database/scenario_test.py`) - actual results

Data: users Asha, Ravi, Meena; 5 items; teams Alpha and Beta; requests

| Request | Priority | request_time |
|---------|----------|--------------|
| R1 | 3 | 09:10 |
| R2 | 5 | 09:05 |
| R3 | 2 | 09:20 |
| R4 | 4 | 09:30 |
| R5 | 5 | 09:01  (earlier than R2 -> wins the tie) |

Actual C scheduler output of the first run (epoch seconds as sent by the program):

```
ASSIGN 5 1 5 ...      <- R5 -> team 1  (priority 5, earliest of the two priority-5 requests)
ASSIGN 2 2 5 ...      <- R2 -> team 2
WAITING 1 4 4 ...     <- queue position 1: R4 (priority 4)
WAITING 2 1 3 ...     <- queue position 2: R1 (priority 3)
WAITING 3 3 2 ...     <- queue position 3: R3 (priority 2)
SUMMARY assigned=2 pending=3 available_teams=0 busy_teams=2
```

| Step | Verified | Result |
|------|----------|--------|
| 1 | highest priority chosen; tie on priority 5 goes to the earlier `request_time` (R5 before R2) | PASS |
| 1 | both requests `ASSIGNED` with `team_id`; both teams `BUSY`; `current_task` = {R5, R2}; `v_integrity_violations` empty | PASS |
| 2 | **all teams busy:** second run -> 0 assignments, 2 active, 3 pending, no team with two active requests | PASS |
| 3 | complete R5 -> `COMPLETED`; its team `AVAILABLE`, `current_task` NULL; `team_id` stays as history | PASS |
| 3 | run again -> **R4** (priority 4) is assigned, R1 and R3 stay `PENDING` | PASS |
| 4 | complete R2, run -> R1 (priority 3); complete R4, run -> R3 (priority 2); 0 pending; all 5 `COMPLETED`; teams `AVAILABLE` | PASS |
| 5 | **same priority** (two requests with priority 7, one team): the earlier `request_time` wins | PASS |

### Invalid data - actual error messages from MySQL / the C program

| Case | Rejected by | Actual error |
|------|-------------|--------------|
| Missing user (request) | FK | `1452 Cannot add or update a child row: a foreign key constraint fails` |
| Missing user (e-waste) | FK | `1452 ...` |
| Invalid e-waste item id | composite FK | `1452 ...` |
| Item that belongs to another user | composite FK `(item_id, user_id)` | `1452 ...` |
| Invalid e-waste category `TOASTER` | CHECK | `3819 Check constraint 'chk_e_waste_category' is violated.` |
| Weight 0 | CHECK | `3819 Check constraint 'chk_e_waste_weight' is violated.` |
| Priority 11 and priority 0 | CHECK | `3819 Check constraint 'chk_requests_priority' is violated.` |
| PENDING request that already has a team | CHECK | `3819 Check constraint 'chk_requests_no_team_when_pending' is violated.` |
| Invalid team id on a request | FK | `1452 ...` |
| Invalid team status `SLEEPING`, BUSY team without a task | CHECK | `3819 Check constraint 'chk_teams_busy_task' is violated.` |
| Duplicate e-mail | UNIQUE | `1062 Duplicate entry 'asha@example.com' for key 'users.uq_users_email'` |
| Bad phone number | CHECK | `3819 Check constraint 'chk_users_phone' is violated.` |
| **Duplicate assignment:** team already has an active request | UNIQUE (`active_team_id`) | `1062 Duplicate entry '1' for key 'pickup_requests.uq_requests_active_team'` |
| **Duplicate assignment:** one request as `current_task` of two teams | UNIQUE (`current_task`) | `1062 Duplicate entry ... for key 'collection_teams.uq_teams_current_task'` |
| C scheduler: complete an unknown request | C program | exit code 2, `ERROR request or team not found` |
| C scheduler: input where one team holds two active requests | C program | exit code 2 (refused) |

The friendly messages that the *Spring Boot* API returns for bad input (400/404/409 JSON, see `docs/API.md`) are
written in `GlobalExceptionHandler.java` and `backend/scripts/api-smoke-test.sh`, but were **not executed** (section 6).

### Database checks in the same script

| Check | Result |
|-------|--------|
| Primary key on all 4 tables (`information_schema`) | PASS |
| 5 foreign keys, 14 CHECK constraints, 14 secondary/unique indexes exist | PASS |
| 4-table JOIN (`pickup_requests` + `users` + `e_waste` + `collection_teams`) returns the right rows | PASS |
| `EXPLAIN` of the scheduler query uses `idx_requests_status_priority_time` | PASS |
| CRUD: create, update, delete a user | PASS |
| `DELETE` of a user who owns requests is refused (`1451`, ON DELETE RESTRICT) | PASS |
| Transaction: second step fails -> `ROLLBACK` also undoes the first step | PASS |
| `v_integrity_violations` empty at the end | PASS |

## 3. Other automated tests - what they cover

* `database/test_db.sh` (37): seed consistency; every constraint type refuses bad data; impossible team/request states;
  `sp_assign_request` / `sp_complete_request` commit and refuse bad input; rollback; `EXPLAIN`.
* `database/workflow_test.py` (32): C order 1,3,8,2 on the seed data; two assignments, then none while all teams are busy;
  start / complete / cancel; freed team takes the best remaining request; a priority-10 request does **not** preempt running work;
  **6 simultaneous scheduler runs with 2 free teams give exactly 2 assignments**.
* `scheduler/` `make test` (40 + 13): sorting, ties, all-busy, bad input, CLI exit codes.

Run any of them again with the commands in `README.md` -> TESTING.

## 4. How to reproduce the results

```bash
cd scheduler && make && make test && cd ..
pip install pymysql
python3 database/scenario_test.py --user root --password YOUR_ROOT_PASSWORD
python3 database/workflow_test.py --user root --password YOUR_ROOT_PASSWORD
MYSQL_PWD='YOUR_ROOT_PASSWORD' ./database/test_db.sh -u root
```
All three database scripts **re-create the `ecosched` database** - never run them against data you want to keep.

## 5. Tests you must run on your own machine (Spring Boot layer)

```bash
cd backend && mvn clean package            # must say BUILD SUCCESS
mvn spring-boot:run                        # terminal 1
bash backend/scripts/api-smoke-test.sh     # terminal 2: every endpoint, happy + error paths
```
`scheduler-test.sh` needs an **empty** database (run `schema.sql` only, no `seed.sql`) and a built scheduler.

Manual browser test (fresh `schema.sql` + `seed.sql`, backend restarted, frontend on :3000):

| Step | Action | Expected |
|------|--------|----------|
| 1 | open `/scheduler` | queue `#1 (9)`, `#3 (9)`, `#8 (7)`, `#2 (5)`; 2 available teams |
| 2 | **Run Scheduler** | #1 and #3 assigned; those teams BUSY; DB consistency OK |
| 3 | **Run Scheduler** again | "All teams are busy; 2 request(s) stay PENDING" |
| 4 | **Complete Request** on #4 | team becomes available |
| 5 | **Run Scheduler** | #8 (priority 7) is assigned, not #2 |
| 6 | **Start** then **Cancel** on #8 | IN_PROGRESS, then CANCELLED and the team is available again |
| 7 | `/admin` | cards equal the `COUNT(*)` queries in `queries.sql` |

## 6. What was NOT run, and why (known gap)

The Spring Boot backend was **not compiled or started** in the environment that produced these results.
`mvn clean package` stops before compiling anything:

```
[FATAL] Non-resolvable parent POM for com.syscore:ecosched-backend:0.1.0: Could not transfer artifact
org.springframework.boot:spring-boot-starter-parent:pom:3.5.0 from/to central (https://repo.maven.apache.org/maven2):
authorization failed ...
```
The sandbox blocks Maven Central, so no Spring/Hibernate/MySQL-driver jars could be downloaded. This is an environment limit,
not a defect found in the project. Consequently these items are **unverified**: Java compilation, Hibernate mapping of the entities,
the native `v_integrity_violations` query, the JSON error responses, CORS headers from the running server, and the
browser <-> Spring Boot calls. If `mvn clean package` reports a compile error on your machine, paste the exact error and it can be fixed quickly.

Risk assessment: the SQL sequence, lock order and C protocol that `SchedulerService` uses are exactly the ones exercised by the passing
Python tests, and the frontend URLs match the controller routes, so the most likely remaining problems are small (a typo, a mapping annotation).
