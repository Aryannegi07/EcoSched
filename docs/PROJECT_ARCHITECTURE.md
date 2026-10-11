# EcoSched - Project Architecture

**EcoSched - Smart E-Waste Management and Collection Scheduling System**
Team **SysCore** | Team leader: Aryan Negi

The project joins three subjects:

| Subject | Where it shows up |
|---------|-------------------|
| **DBMS** | MySQL schema, keys, constraints, indexes, queries (`database/`, `docs/DBMS.md`) |
| **Web Development** | Spring Boot REST API (`backend/`) and React frontend (`frontend/`, later) |
| **Operating Systems** | Non-preemptive priority scheduler in C (`scheduler/`), see `docs/OS_SCHEDULING.md` |

## 1. Status of each part

| Part | Status |
|------|--------|
| MySQL schema, seed data, queries | Done and tested on MySQL 8.0 |
| Spring Boot backend (entities, repositories, services, controllers, validation, error handling) | Written; compiled only against API stubs (see README "Known issues") |
| C scheduler | Implemented; Spring Boot calls it through a process bridge (stdin/stdout) |
| React frontend | Done: dashboards poll the backend; the Scheduler page shows the OS <-> DBMS flow from real backend data |
| DBMS hardening (Chat 4) | `collection_teams.current_task`, composite FK, CHECKs, triggers, views, stored procedures; tested on MySQL 8.0.46 |

## 2. System overview

```
 +-----------------+    HTTP / JSON     +---------------------------+   JDBC    +------------------+
 | React frontend  | -----------------> |  Spring Boot REST API     | --------> |  MySQL 8         |
 | (later)         | <----------------- |  controller > service >   | <-------- |  (MySQL          |
 +-----------------+                    |  repository (JPA/Hibernate)|          |   Workbench)     |
                                        +---------------------------+           +------------------+
                                                                                        ^
                                         +------------------------+   reads queue /   |
                                         | C scheduler (later)    | ----------------- +
                                         | priority scheduling    |   assigns teams
                                         +------------------------+
```

## 3. Backend layers

```
Controller   receives HTTP, validates the JSON (@Valid), returns JSON
   |
Service      business rules + transactions (@Transactional)
   |
Repository   Spring Data JPA interface -> SQL through Hibernate
   |
Entity       Java class mapped to a table (@Entity)
```

Package layout (`backend/src/main/java/com/syscore/ecosched`):

```
EcoSchedApplication.java      entry point
config/WebConfig.java         CORS for the React app
controller/                   UserController, EWasteController, PickupRequestController, CollectionTeamController
service/                      UserService, EWasteService, PickupRequestService, CollectionTeamService
repository/                   UserRepository, EWasteRepository, PickupRequestRepository, CollectionTeamRepository
entity/                       User, EWaste, PickupRequest, CollectionTeam + enums
dto/                          request bodies (validated) and response bodies, ApiError
exception/                    ResourceNotFound / Conflict / BadRequest + GlobalExceptionHandler
```

### Example flow: `POST /api/requests`

1. `PickupRequestController` receives the JSON; `@Valid` checks required fields and `priority` 1-10 (else 400).
2. `PickupRequestService.createRequest` loads the user and item (else 404).
3. It checks the item belongs to the user (else 400) and has no open request (else 409).
4. It saves a `PickupRequest` with `status = PENDING`, `team = null`, `request_time = now`.
5. The result is returned as `PickupRequestResponse` with HTTP 201.
6. If anything throws, `GlobalExceptionHandler` turns it into the standard JSON error.

## 4. Design decisions

| Decision | Reason |
|----------|--------|
| `ddl-auto=none`, schema in `schema.sql` | The DBMS design is explicit and viva-friendly; Hibernate cannot silently alter tables |
| DTOs for input | Clients cannot set ids, status or team; validation rules live in one place |
| Flat response DTOs for items and requests | JSON shows `user_id`, `item_id`, `team_id` instead of nested objects (and avoids lazy-loading problems) |
| `User` and `CollectionTeam` returned directly | They have no relationships, so it is safe and keeps the code short |
| Relationships are `@ManyToOne` (lazy), no `@OneToMany` lists | Avoids JSON loops and accidental loading of big lists |
| snake_case JSON | Matches the request fields in the project brief (`request_id`, `user_id`, ...) |
| Plain getters/setters, no Lombok | Beginner-friendly: nothing hidden |
| Enums stored as text (`@Enumerated(STRING)`) | Readable in MySQL Workbench; matches the CHECK constraints |

## 5. Configuration and secrets

- `backend/src/main/resources/application.properties` contains **no passwords**; it reads environment variables.
- `.env.example` (project root) lists the variables. Copy it to `.env` (git-ignored) and fill it in.
- `DB_PASSWORD` has no default: the backend refuses to start without it.
- The app should use its own MySQL user with only `SELECT, INSERT, UPDATE, DELETE` on the `ecosched` database (see README).

| Variable | Default | Meaning |
|----------|---------|---------|
| `DB_HOST` | localhost | MySQL host |
| `DB_PORT` | 3306 | MySQL port |
| `DB_NAME` | ecosched | database name |
| `DB_USERNAME` | ecosched_user | MySQL user |
| `DB_PASSWORD` | *(required)* | MySQL password |
| `SERVER_PORT` | 8080 | backend port |
| `CORS_ALLOWED_ORIGINS` | http://localhost:3000 | comma-separated browser origins |
| `JPA_SHOW_SQL` | false | print SQL in the console |

## 6. How the scheduler plugs in

```
React  ->  Spring Boot  ->  MySQL
              |  (1) read teams + open requests (rows locked)
              v
        scheduler/ecosched_scheduler   (C, started per call, text over stdin/stdout)
              |  (2) ASSIGN / COMPLETED decisions
              v
        Spring Boot  (3) update pickup_requests + collection_teams in the same transaction
```

`SchedulerService` does steps 1-3 inside one `@Transactional` method (`SELECT ... FOR UPDATE` on teams and open requests), so two runs can never assign the same request or team. The C program makes the decision; it never touches the database. Details: `docs/OS_SCHEDULING.md` and `scheduler/README.md`.

## 7. OS <-> DBMS data flow (Chat 4)

```
React (Run Scheduler)
  -> POST /api/scheduler/run                          Spring Boot, SchedulerService.run()  [@Transactional]
       -> SELECT ... FOR UPDATE teams, open requests  MySQL (row locks)
       -> stdin: TEAM / REQUEST lines  ---------->    C scheduler (ecosched_scheduler run)
       <- stdout: ASSIGN / WAITING / SUMMARY lines <-
       -> UPDATE pickup_requests, UPDATE collection_teams, COMMIT   MySQL (4 columns, all-or-nothing)
  <- JSON (assignments with request/team status after the update)
React reloads GET /api/scheduler/queue + /status (+ GET /api/admin/stats on the admin page)
```

New in this chapter: `AdminController` (`/api/admin/stats`), start/cancel/update/delete endpoints, `SchedulerStatusResponse.last_run`, `integrity_violations`, frontend `useFetch` polling, `FlowDiagram`, `RefreshBar`.
The frontend polls (5 s on the Scheduler page, 10 s on the Admin page, switchable) - there are no WebSockets.
