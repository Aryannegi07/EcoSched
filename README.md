# EcoSched - Smart E-Waste Management and Collection Scheduling System

**Team SysCore** | Team leader: Aryan Negi
College PBL project combining **Operating Systems**, **DBMS** and **Web Development**.

```
React  ->  Spring Boot  ->  MySQL
              |
              +-> C Priority Scheduler  (decides; result written back to MySQL)
```

## Project status (about 45 % of Phase 1, verified part)

| Part | Status |
|------|--------|
| MySQL schema, seed, queries, procedures | Verified on MySQL 8.0.46 (`database/test_db.sh` 37/37) |
| C priority scheduler (non-preemptive) | Verified (`make test`: 40 unit + 13 CLI tests) |
| OS <-> DBMS workflow (C binary + MySQL) | Verified (`workflow_test.py` 32/32, `scenario_test.py` 55/55) |
| React frontend | `npm run build` OK; API paths match the controllers |
| Spring Boot backend | **Written but NOT yet built/run in the test environment** (Maven Central was blocked). Run `mvn clean package` on your machine - see `docs/TESTING.md` section 6 |

Real test output is in `docs/test-results/`.

## Authentication and administrator setup

Copy `.env.example` to `.env` and set `ADMIN_EMAIL` and `ADMIN_PASSWORD` (8+ characters). On startup the backend provisions or updates that single dedicated account with a BCrypt hash; public administrator registration is not available. Existing installations must first run `database/migration_auth_images.sql`; it is additive and does not drop tables or data. Uploaded images are stored under `UPLOAD_DIR` (default `uploads`) and are not committed.

## Requirements

- JDK 17 or newer (`java -version`)
- Maven 3.9+ (`mvn -v`)
- MySQL 8.0.16+ (CHECK constraints) and MySQL Workbench
- `gcc` and `make` (Windows: MinGW or WSL)
- Node.js 18+ and npm
- Python 3 + `pip install pymysql` (only for the database scenario tests)
- No PostgreSQL, pgAdmin or MongoDB is used.

---

## MYSQL SETUP

Run from the project root (`EcoSched/`). `SOURCE` works in every shell, including Windows PowerShell.

```bash
mysql -u root -p
```
```sql
SOURCE database/schema.sql;
SOURCE database/seed.sql;
SOURCE database/procedures.sql;   -- optional

CREATE USER 'ecosched_user'@'localhost' IDENTIFIED BY 'PUT_A_STRONG_PASSWORD_HERE';
GRANT SELECT, INSERT, UPDATE, DELETE ON ecosched.* TO 'ecosched_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

- `schema.sql` **drops and recreates** the tables: running it again resets your data. Run `seed.sql` right after it (a second seed run fails with a duplicate-key error).
- Check: `mysql -u ecosched_user -p ecosched -e "SELECT COUNT(*) FROM users;"` -> 5 users, 8 e-waste items, 4 teams, 8 requests (4 pending).
- Check: `SELECT * FROM v_integrity_violations;` must return 0 rows.
- You can also open the `.sql` files in MySQL Workbench and run them.

## BACKEND SETUP

1. Create the settings file (never commit it; it is git-ignored):
   ```bash
   cp .env.example .env        # Windows: copy .env.example .env
   ```
2. Edit `.env` and set `DB_PASSWORD` to the password you chose in MYSQL SETUP (no quotes).
   The backend refuses to start without it. Real environment variables override `.env`.
3. Build:
   ```bash
   cd backend
   mvn clean package
   ```
   Expected: `BUILD SUCCESS`. Needs internet the first time (Maven downloads Spring Boot).

`.env.example` contains only placeholders - it holds no real password.

## FRONTEND SETUP

```bash
cd frontend
npm install
```
Optional: `cp .env.example .env` and change `VITE_API_BASE_URL` (default `http://localhost:8080/api`).
The dev server must use port **3000** (already set in `vite.config.js`); this is the origin the backend allows through CORS.
If you need another origin, add it to `CORS_ALLOWED_ORIGINS` in the root `.env` and restart the backend.

## SCHEDULER SETUP

```bash
cd scheduler
make            # builds ./ecosched_scheduler
make test       # 40 unit tests + 13 CLI tests (no database needed)
```
Build it **before** starting the backend. The backend finds `scheduler/ecosched_scheduler` automatically (when started from
`backend/` or from the project root); set `SCHEDULER_BIN` in `.env` for another path. On Windows with MinGW the file is `ecosched_scheduler.exe`.
Details: `scheduler/README.md`, `docs/OS_SCHEDULING.md`.

## RUN COMMANDS

Open three terminals, in this order (MySQL must already be running):

```bash
# 1. scheduler (once)
cd scheduler && make

# 2. backend  -> http://localhost:8080
cd backend && mvn spring-boot:run

# 3. frontend -> http://localhost:3000
cd frontend && npm start
```
Quick check: `curl http://localhost:8080/api/teams/available`

Demo (fresh `schema.sql` + `seed.sql`, backend restarted):
1. Open <http://localhost:3000/scheduler> - queue shows requests 1, 3, 8, 2 (priority 9, 9, 7, 5).
2. **Run scheduler** - requests 1 and 3 go to the two free teams.
3. **Run scheduler** again - nothing happens, all teams busy (non-preemptive).
4. **Complete** on #4 (Active pickups), then **Run scheduler** - the freed team gets request 8 (priority 7), not 2.
5. <http://localhost:3000/admin> (Dashboard) shows the same numbers computed by MySQL.

## API ENDPOINTS

Base URL `http://localhost:8080/api` (JSON, snake_case). Full examples and error codes: `docs/API.md`.

| Method | Path | Purpose |
|--------|------|---------|
| POST / GET | `/users` | register / list users |
| GET | `/users/{id}` | one user |
| POST / GET | `/ewaste` | register / list e-waste items |
| GET | `/ewaste/{id}` | one item |
| POST / GET | `/requests` | create pickup request / list all |
| GET | `/requests/pending` | pending requests |
| GET | `/requests/priority` | pending requests, highest priority first |
| GET | `/requests/user/{userId}` | request history of a user |
| GET | `/requests/{id}` | one request |
| PUT | `/requests/{id}/start` | ASSIGNED -> IN_PROGRESS |
| PUT | `/requests/{id}/complete` | -> COMPLETED, team -> AVAILABLE (current_task cleared) |
| PUT | `/requests/{id}/cancel` | -> CANCELLED, releases the team |
| POST / GET | `/teams` | create / list collection teams |
| GET | `/teams/available` | available teams |
| PUT / DELETE | `/teams/{id}` | update / delete a team |
| POST | `/scheduler/run` | run the C priority scheduler once |
| GET | `/scheduler/queue` | ready queue in dispatch order |
| GET | `/scheduler/status` | counts, per-team state, last run, integrity check |
| GET | `/admin/stats` | dashboard numbers computed by MySQL |
| GET | `/admin/ewaste-stats` | e-waste totals by category |

## TESTING

Full results and explanations: `docs/TESTING.md`. Viva preparation: `docs/VIVA_QUESTIONS.md`.

```bash
# C scheduler
cd scheduler && make test

# Database + OS<->DBMS (these RE-CREATE the database `ecosched`)
pip install pymysql
python3 database/scenario_test.py --user root --password YOUR_ROOT_PASSWORD   # 3 users, 5 items, 5 requests, 2 teams
python3 database/workflow_test.py --user root --password YOUR_ROOT_PASSWORD
MYSQL_PWD='YOUR_ROOT_PASSWORD' ./database/test_db.sh -u root

# Frontend build
cd frontend && npm run build

# Spring Boot API (backend running)
bash backend/scripts/api-smoke-test.sh
bash backend/scripts/scheduler-test.sh      # needs an EMPTY database: schema.sql only, no seed.sql
```

Last results: C 40+13 pass, `test_db.sh` 37/37, `workflow_test.py` 32/32, `scenario_test.py` 55/55, frontend build OK.
Spring Boot layer: not yet run (see `docs/TESTING.md` section 6).

## PROJECT STRUCTURE

```
EcoSched/
├── backend/                 Spring Boot + Maven + JPA/Hibernate (Java 17+)
│   ├── pom.xml
│   ├── scripts/             api-smoke-test.sh, scheduler-test.sh
│   └── src/main/java/com/syscore/ecosched/
│       ├── controller/      REST endpoints
│       ├── service/         business logic, SchedulerService (MySQL <-> C)
│       ├── scheduler/       SchedulerBridge (starts the C program)
│       ├── repository/      Spring Data JPA
│       ├── entity/  dto/  exception/  config/
├── frontend/                React (Vite): pages, components, api.js
├── scheduler/               C priority scheduler: library, CLI bridge, tests, Makefile
├── database/
│   ├── schema.sql  seed.sql  queries.sql  procedures.sql  scheduler_checks.sql
│   ├── test_db.sh           constraint + transaction tests
│   ├── workflow_test.py     OS<->DBMS workflow + concurrency test
│   └── scenario_test.py     Phase-1 scenario test (5 requests, 2 teams, invalid data)
├── docs/
│   ├── PROJECT_ARCHITECTURE.md  DBMS.md  OS_SCHEDULING.md  API.md
│   ├── TESTING.md  VIVA_QUESTIONS.md
│   └── test-results/        raw logs of the test runs
├── .env.example             placeholders only
├── .gitignore
└── README.md
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Could not resolve placeholder 'DB_PASSWORD'` | `.env` is missing or `DB_PASSWORD` is empty |
| `Access denied for user 'ecosched_user'` | wrong password, or the user was not created |
| `Unknown database 'ecosched'` | run `schema.sql` first |
| `Table ... doesn't exist` / unknown column | re-run `schema.sql` then `seed.sql` |
| Browser: `blocked by CORS policy` | open the app at http://localhost:3000; restart the backend after editing `CORS_ALLOWED_ORIGINS` |
| `/api/scheduler/*` returns 503 "C scheduler not found" | run `cd scheduler && make`, or set `SCHEDULER_BIN` |
| Port 8080 busy | set `SERVER_PORT=8081` in `.env` and `VITE_API_BASE_URL` in `frontend/.env` |
| `release version 17 not supported` | install JDK 17+ and check `java -version` / `mvn -v` |
| `Port 3000 is already in use` | stop the other app; the frontend must use 3000 |

## Documentation

- `docs/PROJECT_ARCHITECTURE.md` - layers, design decisions, configuration
- `docs/DBMS.md` - ER diagram, data dictionary, constraints, indexes, normalization
- `docs/OS_SCHEDULING.md` - OS theory and how the C scheduler implements it
- `docs/API.md` - every endpoint with examples and error codes
- `docs/TESTING.md` - test plan and real results
- `docs/VIVA_QUESTIONS.md` - beginner-friendly viva questions and answers
- `scheduler/README.md` - data structures, CLI protocol, build and test
