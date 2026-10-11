# EcoSched — Smart E-Waste Collection and Scheduling System

EcoSched is a college PBL project that combines **Operating Systems concepts, DBMS, and full-stack web development** to manage e-waste collection requests.

The project has seven main functions:

1. **User Registration** — register users with contact and address details.
2. **E-Waste Registration** — record electronic items, their condition, category, and weight.
3. **Pickup Request Creation** — create pickup requests for registered e-waste.
4. **Admin Dashboard** — view users, e-waste, pickup requests, teams, and summary statistics.
5. **Priority Scheduling** — a C implementation of non-preemptive priority scheduling.
6. **Collection-Team Allocation** — assign pending requests to available collection teams.
7. **Request Tracking and Completion** — track request status and release a team when work is completed.

## Technology stack

- **Frontend:** React, Vite, JavaScript, CSS
- **Backend:** Java 17+, Spring Boot, Maven, Spring Data JPA
- **Database:** MySQL
- **OS concept:** C-based non-preemptive priority scheduler
- **Development tools:** MySQL Workbench, VS Code, GCC

## How the system works

```text
React frontend
      |
      v
Spring Boot REST API
      |
      +------ MySQL database
      |
      +------ C priority scheduler
                   |
                   v
        Selects the highest-priority
        pending request for an available team
```

The scheduler treats pickup requests as tasks and collection teams as limited resources. A higher numeric priority is selected first. If priorities are equal, the earlier request time wins; request ID provides a deterministic final tie-breaker. Scheduling is non-preemptive: an active pickup is not interrupted by a newly arrived request.

Typical request statuses are `PENDING`, `ASSIGNED`, `IN_PROGRESS`, and `COMPLETED`. The backend also defines `CANCELLED` for cancellation handling.

## Project structure

```text
EcoSched/
├── backend/       Spring Boot REST API
├── database/      MySQL schema, seed data, and SQL scripts
├── docs/          API, testing, and project documentation
├── frontend/      React + Vite user interface
├── scheduler/     C scheduler, CLI, and tests
├── .env.example   Template for local environment configuration
└── README.md
```

## Prerequisites

Install these tools before running the project:

- JDK 17 or newer
- Maven
- MySQL 8.x and MySQL Workbench
- Node.js and npm
- GCC (MinGW on Windows is fine)

`make` is optional on Windows. If it is unavailable, compile the C scheduler directly with GCC as shown below.

## 1. Configure the database

Start MySQL, then open MySQL Workbench or a MySQL shell. From the project root, run the SQL scripts in this order:

```sql
SOURCE database/schema.sql;
SOURCE database/seed.sql;
```

Run `database/procedures.sql` as well if you need the stored procedures.

**Warning:** `schema.sql` drops and recreates the project tables. Do not run it against data you need to keep. `seed.sql` inserts sample records and normally should not be run repeatedly without resetting the database.

Create a dedicated database user if you have not already done so:

```sql
CREATE USER 'ecosched_user'@'localhost' IDENTIFIED BY 'REPLACE_WITH_YOUR_OWN_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE ON ecosched.* TO 'ecosched_user'@'localhost';
FLUSH PRIVILEGES;
```

If the user already exists, update its password or reuse the existing account instead of running `CREATE USER` again.

## 2. Configure environment variables

In PowerShell, from the project root:

```powershell
Copy-Item .env.example .env
notepad .env
```

Set the values for your local MySQL account. Example:

```dotenv
DB_HOST=localhost
DB_PORT=3306
DB_NAME=ecosched
DB_USERNAME=ecosched_user
DB_PASSWORD=REPLACE_WITH_YOUR_OWN_PASSWORD

SERVER_PORT=8081
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
JPA_SHOW_SQL=false

SCHEDULER_BIN=D:\EcoSched\scheduler\ecosched_scheduler.exe
SCHEDULER_TIMEOUT_SECONDS=10
```

Use the actual path where you extracted the project. The `SCHEDULER_BIN` line should point to the compiled scheduler executable. Keep `.env` private; it must not be committed to GitHub.

## 3. Build the C scheduler

Open PowerShell:

```powershell
cd D:\EcoSched\scheduler
gcc -std=c11 -O2 -Wall -Wextra scheduler_cli.c priority_scheduler.c -o ecosched_scheduler.exe
```

Verify the executable:

```powershell
Test-Path .\ecosched_scheduler.exe
```

Expected result: `True`.

If `make` is installed, the project's `Makefile` can also be used. GCC is sufficient to compile the executable directly on Windows.

## 4. Start the backend

Open a new terminal:

```powershell
cd D:\EcoSched\backend
mvn spring-boot:run
```

The backend port is configured by `SERVER_PORT` in the root `.env`. With the example above, the API base URL is:

`http://localhost:8081/api`

Keep this terminal running.

## 5. Start the frontend

Open another terminal:

```powershell
cd D:\EcoSched\frontend
npm install
```

If the `npm` command is broken on your Windows setup but Node.js works, run npm directly using your installed npm CLI. For example:

```powershell
node "D:\VS Code\nodejs\node_modules\npm\bin\npm-cli.js" install
node "D:\VS Code\nodejs\node_modules\npm\bin\npm-cli.js" run dev
```

Ensure `frontend/.env` contains:

```dotenv
VITE_API_BASE_URL=http://localhost:8081/api
```

Start Vite:

```powershell
npm run dev
```

The Vite development server is configured for port `3000`. Open:

- Home page: http://localhost:3000/
- Admin dashboard: http://localhost:3000/admin
- Scheduler: http://localhost:3000/scheduler

If Vite prints a different URL, use the URL shown in its terminal.

## 6. Basic verification

- Confirm MySQL is running and the `ecosched` database exists.
- Confirm the backend startup log says it started successfully on the configured port.
- Open `http://localhost:8081/api/teams/available` to check the API, adjusting the port if your `.env` differs.
- Open the frontend and test the seven functions.
- Visit the Scheduler page and run the scheduler. If the API returns an error, check the backend terminal and verify that `SCHEDULER_BIN` points to an existing executable.

## GitHub safety checklist

Before pushing the project:

- **Never commit `.env`** or any real database password, API key, token, or credential.
- Ensure `.env` is listed in `.gitignore`.
- Keep only placeholder values in `.env.example`.
- Do not commit generated files such as `node_modules`, Maven `target`, or compiled `.exe` files unless there is a specific reason to distribute them.

## Project status

This README describes the current project structure and local run workflow. The project should be treated as **in development** until all seven functions have been tested end-to-end on the target machine. Successful frontend rendering alone does not prove that every backend endpoint or the C scheduler integration works correctly.

## Team

**Team SysCore**  
Project: EcoSched — Smart E-Waste Management and Collection Scheduling System
