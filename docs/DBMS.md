# EcoSched - Database Design (DBMS)

Database: **MySQL 8.0+**, engine **InnoDB**, character set `utf8mb4`. Monitor it with **MySQL Workbench**.
Files: `database/schema.sql` (tables, constraints, triggers, views), `database/seed.sql` (sample data), `database/queries.sql` (24 queries + CRUD/transaction examples), `database/procedures.sql` (assign/complete as stored procedures), `database/scheduler_checks.sql` (invariant checks), `database/test_db.sh` and `database/workflow_test.py` (tests, see `docs/TESTING.md`).
`schema.sql` is the single source of truth: Hibernate is set to `ddl-auto=none`, so it never changes the tables.

## 1. ER diagram

```
 +-----------+ 1       N +-----------+ 1       N +-----------------+ N       1 +------------------+
 |   users   |-----------|  e_waste  |-----------| pickup_requests |-----------| collection_teams |
 | PK user_id|  owns     | PK item_id|  is asked | PK request_id   | handled   | PK team_id       |
 +-----------+           | FK user_id|  for in   | FK user_id      |  by       +------------------+
       | 1               +-----------+           | FK item_id      |
       |                                         | FK team_id (NULL until assigned)
       +---------------- N ----------------------+
                makes (user_id)
```

Relationships required by the project:

| Relationship | Cardinality | Implemented by |
|--------------|-------------|----------------|
| users - e_waste | 1 : N | `e_waste.user_id -> users.user_id` |
| users - pickup_requests | 1 : N | `pickup_requests.user_id -> users.user_id` |
| e_waste - pickup_requests | 1 : N | `pickup_requests.(item_id, user_id) -> e_waste.(item_id, user_id)` |
| collection_teams - pickup_requests | 1 : N over time | `pickup_requests.team_id -> collection_teams.team_id` (NULL until assigned) |
| collection_teams - pickup_requests (current job) | 1 : 0..1 | `collection_teams.(team_id, current_task) -> pickup_requests.(team_id, request_id)` |

"1 : N" for e_waste - pickup_requests means one item may have several requests **over time** (for example a cancelled one and a later one), but the application allows only one *open* request per item at a time.

## 2. Data dictionary

### users
| Column | Type | Constraints |
|--------|------|-------------|
| user_id | BIGINT AUTO_INCREMENT | **PK** |
| full_name | VARCHAR(100) | NOT NULL |
| email | VARCHAR(150) | NOT NULL, **UNIQUE**, CHECK looks like an email |
| phone | VARCHAR(15) | NOT NULL, CHECK 10-13 digits (optional `+`) |
| address | VARCHAR(255) | NOT NULL |
| created_at | DATETIME | NOT NULL, default current time |

### e_waste
| Column | Type | Constraints |
|--------|------|-------------|
| item_id | BIGINT AUTO_INCREMENT | **PK** |
| user_id | BIGINT | NOT NULL, **FK -> users** |
| item_name | VARCHAR(100) | NOT NULL |
| category | VARCHAR(30) | NOT NULL, CHECK in (LAPTOP, MOBILE, TABLET, BATTERY, TV_MONITOR, APPLIANCE, ACCESSORY, OTHER) |
| item_condition | VARCHAR(20) | NOT NULL, default `NON_WORKING`, CHECK in (WORKING, DAMAGED, NON_WORKING) |
| quantity | INT | NOT NULL, default 1, CHECK > 0 |
| weight_kg | DECIMAL(8,2) | NOT NULL, CHECK > 0 |
| description | VARCHAR(255) | NULL allowed |
| created_at | DATETIME | NOT NULL, default current time |

Extra key: `UNIQUE (item_id, user_id)` - needed so `pickup_requests` can reference the pair (see section 4).

### collection_teams
| Column | Type | Constraints |
|--------|------|-------------|
| team_id | BIGINT AUTO_INCREMENT | **PK** |
| team_name | VARCHAR(100) | NOT NULL, **UNIQUE** |
| contact_phone | VARCHAR(15) | NOT NULL, CHECK 10-13 digits |
| vehicle_number | VARCHAR(20) | NULL allowed |
| status | VARCHAR(20) | NOT NULL, default `AVAILABLE`, CHECK in (AVAILABLE, BUSY) |
| created_at | DATETIME | NOT NULL, default current time |

### pickup_requests
| Column | Type | Constraints |
|--------|------|-------------|
| request_id | BIGINT AUTO_INCREMENT | **PK** |
| user_id | BIGINT | NOT NULL, **FK -> users** |
| item_id | BIGINT | NOT NULL, part of composite **FK -> e_waste(item_id, user_id)** |
| team_id | BIGINT | NULL, **FK -> collection_teams** |
| location | VARCHAR(255) | NOT NULL |
| priority | INT | NOT NULL, default 1, CHECK between 1 and 10 (higher = more urgent) |
| request_time | DATETIME | NOT NULL, default current time |
| status | VARCHAR(20) | NOT NULL, default `PENDING`, CHECK in (PENDING, ASSIGNED, IN_PROGRESS, COMPLETED, CANCELLED) |

Row-level business rules enforced by the database itself:

- `chk_requests_team_when_active`: status `ASSIGNED` or `IN_PROGRESS` requires a `team_id`.
- `chk_requests_no_team_when_pending`: a `PENDING` request cannot already have a team.

## 3. Keys and referential actions

All foreign keys use `ON DELETE RESTRICT`: you cannot delete a user who owns items or requests, an item that has requests, or a team that handled requests. This protects history; "removal" is done by status (`CANCELLED`) instead of deleting rows.

## 4. Why a composite foreign key?

`pickup_requests` has both `user_id` and `item_id`. A plain pair of foreign keys would allow user 5 to request pickup of an item that belongs to user 1. Referencing `e_waste(item_id, user_id)` makes MySQL reject that row itself. The API checks the same rule first to give a friendly 400 message; the database is the safety net.

## 5. Indexes

| Index | Table | Why |
|-------|-------|-----|
| PRIMARY (all tables) | all | row lookup by id |
| `uq_users_email` | users | fast unique check on registration |
| `uq_teams_name` | collection_teams | unique team names |
| `idx_e_waste_user` | e_waste | list a user's items; FK support |
| `idx_e_waste_category` | e_waste | reports grouped by category |
| `idx_teams_status` | collection_teams | find `AVAILABLE` teams |
| `idx_requests_user`, `idx_requests_item_user`, `idx_requests_team` | pickup_requests | foreign-key joins |
| `idx_requests_status_priority_time (status, priority DESC, request_time ASC)` | pickup_requests | the scheduler's priority-queue query: `WHERE status='PENDING' ORDER BY priority DESC, request_time ASC` |

`EXPLAIN` on the queue query shows it uses `idx_requests_status_priority_time` ("Using index", no filesort) - see Q17 in `queries.sql`.

## 6. Views

`v_pending_priority_queue` returns pending requests already sorted highest-priority first. The C scheduler orders requests the same way (priority DESC, request_time ASC).

## 7. Normalization

- **1NF**: every column holds one atomic value; every table has a primary key.
- **2NF**: all primary keys are single columns, so no partial dependencies are possible.
- **3NF**: non-key columns depend only on their table's key (a user's name/email depend on `user_id`; an item's weight on `item_id`; a team's vehicle on `team_id`).
- **One deliberate redundancy**: `pickup_requests.user_id` could be derived from `item_id` (via `e_waste.user_id`). It is kept on purpose so requests can be queried per user without a join, and so the composite foreign key can guarantee the two always agree.

## 8. Consistency between request and team (OS <-> DBMS)

Assigning work changes **two tables**, and they must always agree:

| pickup_requests | collection_teams |
|-----------------|------------------|
| `team_id = T`, `status = ASSIGNED / IN_PROGRESS` | `team T`: `status = BUSY`, `current_task = request id` |

The forbidden state from the project brief is *"request says Team 1, but Team 1 is AVAILABLE"*. Rules in `schema.sql`:

| Rule | Mechanism |
|------|-----------|
| BUSY <=> has a current task | `CHECK chk_teams_busy_task` |
| A team can only point at a request that carries **its own** `team_id` | composite FK `fk_teams_current_task (team_id, current_task) -> pickup_requests (team_id, request_id)` |
| One request is the task of at most one team | `UNIQUE uq_teams_current_task` |
| A team never has two active requests | generated column `active_team_id` + `UNIQUE uq_requests_active_team` |
| ASSIGNED/IN_PROGRESS/COMPLETED need a team; PENDING has none | two `CHECK`s on `pickup_requests` |
| `current_task` must be an active request | trigger `trg_teams_current_task_check` |
| A request cannot finish while a team still lists it (release team first) | trigger `trg_requests_release_check` |
| Anything that slipped through (for example manual edits) is visible | view `v_integrity_violations` (0 rows = consistent) |

**Honest limit:** MySQL has no deferrable constraints, so the database checks each statement immediately. That is why the direction *"request is active but its team is not yet BUSY"* cannot be a hard constraint: for a split second inside the assignment transaction it is legitimately true. That direction is guaranteed by the **transaction** (below) and *detected* by `v_integrity_violations`, which the dashboards show as "DB consistency: OK".

## 9. Transactions (ACID)

InnoDB gives atomic, durable transactions with row-level locking.

**Assign (one scheduler round)** - `SchedulerService.run()` is `@Transactional`:

```
BEGIN
 SELECT ... FROM collection_teams FOR UPDATE             -- lock teams first
 SELECT ... FROM pickup_requests WHERE status IN (PENDING, ASSIGNED, IN_PROGRESS) FOR UPDATE
 -- C scheduler decides; for each ASSIGN line:
 UPDATE pickup_requests  SET team_id = T, status = 'ASSIGNED'                 WHERE request_id = R   -- 1, 2
 UPDATE collection_teams SET status = 'BUSY', current_task = R               WHERE team_id = T      -- 3, 4
COMMIT          -- any error => ROLLBACK, nothing is half-applied
```

The request is flushed *before* the team because the team's composite FK needs the request to already carry `team_id = T` (`saveAndFlush` in that order). **Complete / cancel** do the reverse: release the team (`AVAILABLE`, `current_task = NULL`), then close the request - the trigger enforces that order. The same logic exists in pure SQL as `sp_assign_request` / `sp_complete_request` (`database/procedures.sql`) so it can be shown in Workbench.

**Concurrency:** teams are always locked before requests, so two simultaneous runs are serialised and cannot deadlock or assign the same team twice (tested with 6 concurrent runs, `docs/TESTING.md`).

## 10. Sample data

`seed.sql` inserts 5 users, 8 items, 4 teams and 8 requests covering every status (4 `PENDING`, 1 `ASSIGNED`, 1 `IN_PROGRESS`, 1 `COMPLETED`, 1 `CANCELLED`). Teams 1 and 2 are `BUSY` with `current_task` = requests 4 and 5; teams 3 and 4 are `AVAILABLE`, so the first scheduler run assigns requests 1 and 3 (priority 9). Teams are inserted `AVAILABLE` and switched to `BUSY` after the requests exist, because of the circular foreign key. One user (id 5) has an item but no request, to demonstrate left joins.

## 11. Possible viva questions

1. **Why InnoDB?** Foreign keys, transactions, row-level locking. MyISAM has none of these.
2. **Why `VARCHAR + CHECK` instead of MySQL `ENUM`?** Easier to map with JPA `@Enumerated(STRING)` and easy to read; the CHECK still rejects invalid values (enforced from MySQL 8.0.16).
3. **What stops two requests for one item?** The service rejects it (409). A database-level rule is not in place (MySQL has no partial unique index); the generated-column trick used for `active_team_id` could be reused for it.
9. **How do you keep `team_id` and the team status consistent?** CHECK + composite FK + triggers + one transaction; see section 8.
10. **Why a generated column?** MySQL cannot create a partial unique index, so `active_team_id` is `team_id` only while the request is active; a UNIQUE index on it means one active request per team.
4. **Why is `team_id` nullable?** A new request has no team until the scheduler assigns one; CHECK constraints keep it consistent with `status`.
5. **What does `ON DELETE RESTRICT` do?** Blocks deleting a parent row while child rows still reference it.
6. **Why a descending index column?** MySQL 8 can store `priority DESC`, so the priority-queue query reads rows already in the right order.
7. **Difference between PRIMARY KEY and UNIQUE?** Both are unique; a table has one primary key (never NULL), but many unique keys.
8. **How do you reset the database?** Re-run `schema.sql` (it drops and recreates the tables), then `seed.sql`.
