# Operating Systems in EcoSched: Non-Preemptive Priority Scheduling

> **Important:** EcoSched does **not** contain an operating-system kernel. It is a web application that **applies Operating Systems concepts** (scheduling, resource allocation, process states) to its own problem: deciding which pickup request is served next by which collection team.

## 1. Core OS concepts

**Operating System (OS).** Software that manages hardware (CPU, memory, disks, devices) and gives programs a safe, fair way to share it. Its main jobs are process management, memory management, file systems, device management and protection.

**Kernel.** The core part of an OS that runs with full hardware privileges. It creates processes, schedules the CPU, handles interrupts and system calls. (EcoSched has no kernel; it only borrows the scheduler idea.)

**Process.** A program in execution: code plus its current state (registers, memory, open files). The OS keeps a Process Control Block (PCB) for each one.

**Process states.**

```
 New --admit--> Ready --dispatch--> Running --exit--> Terminated
                  ^                    |
                  |  (preemption only) |
                  +--------------------+
                  ^                    | I/O or event wait
                  +---- Waiting <------+
```

| State | Meaning | EcoSched equivalent |
|---|---|---|
| New | being created | request being submitted |
| Ready | waiting for the CPU | `PENDING` |
| Running | using the CPU | `ASSIGNED` / `IN_PROGRESS` (a team is working on it) |
| Waiting | blocked on I/O | not used |
| Terminated | finished | `COMPLETED` (or `CANCELLED`) |

**Ready queue.** The list of processes that are ready and waiting for the CPU. The **CPU scheduler** picks one of them whenever the CPU is free.

**CPU scheduling.** The policy that chooses the next ready process. Goals: keep the CPU busy, short waiting time, fairness, and respect for importance.

**Priority scheduling.** Each process has a priority number; the scheduler always runs the ready process with the best priority. Equal priorities need a tie-breaker (here: the one that arrived first, i.e. FCFS among equals). Risk: **starvation** of low-priority processes, usually reduced by *aging* (slowly raising the priority of waiting processes). Aging is not implemented in EcoSched yet.

**Preemptive vs non-preemptive.**

| | Preemptive | Non-preemptive |
|---|---|---|
| New higher-priority arrival | can take the CPU from the running process | waits until the running process finishes |
| Overhead | context switches | none |
| Fits when | work can be paused cheaply (CPU tasks) | work cannot be paused (a truck on a pickup) |

## 2. Why EcoSched uses non-preemptive scheduling

A collection team that has driven to a house and is loading a battery cannot be "paused" and sent across the city because a more urgent request arrived: the drive and loading would be wasted and the first citizen would be left half-served. Switching a team has a real physical cost (the context switch of the real world). So once a team is assigned, the request **runs to completion**. The urgent request simply goes to the front of the ready queue and is served by the next team that becomes free. Rule: **higher numeric priority = higher priority** (1-10); ties go to the **earlier `request_time`** (then the lower `request_id`, so the result is always deterministic).

Example: R1=3, R2=5, R3=2, R4=4 with one team executes **R2 -> R4 -> R1 -> R3**. If an R5 with priority 10 arrives while R2 is running, R2 still finishes first; R5 is then served before R4, R1 and R3.

## 3. Mapping OS to EcoSched

| OS concept | EcoSched |
|---|---|
| Process / task | Pickup request (`pickup_requests` row) |
| Ready queue | Pending request queue (`status = PENDING`, view `v_pending_priority_queue`) |
| CPU scheduler | `scheduler/priority_scheduler.c` |
| CPU / resource | Collection team (`collection_teams` row) |
| Resource allocation | Assigning a team to a request (`team_id`, status `ASSIGNED`) |
| Busy resource | Team handling a pickup (`BUSY`, `current_task` set) |
| Available resource | `AVAILABLE` team |
| Process completion | Pickup completion (`COMPLETED`, team freed) |

**Resource allocation.** Teams are the limited resource (like CPUs). Rule: one team handles at most one active request at a time. With 10 requests and 2 teams, only 2 are active; 8 stay `PENDING`. This is enforced three times: in C (`ps_assign` refuses a busy team, `ps_validate` checks the result), in Java (re-checks the locked rows before saving) and in the database (row locks plus CHECK constraints).

## 4. Scheduler workflow

```
1. User creates a request            -> PENDING, team_id NULL
2. Admin clicks "Run scheduler"      -> POST /api/scheduler/run
3. Spring Boot locks and reads       -> all teams + PENDING/ASSIGNED/IN_PROGRESS requests
4. Spring Boot starts the C program  -> state written to its stdin
5. C: while (a team is AVAILABLE and a request is PENDING)
         pick best request (priority DESC, request_time ASC); give it the free team
6. C prints ASSIGN lines             -> Spring Boot reads stdout
7. Spring Boot updates MySQL         -> request ASSIGNED + team_id, team BUSY (one transaction)
8. Team finishes                     -> PUT /api/requests/{id}/complete
9. C marks request COMPLETED, team AVAILABLE, current_task cleared; Spring Boot saves it
10. Run the scheduler again          -> the next best pending request gets the free team
```

## 5. C implementation

Files in `scheduler/`:

- `priority_scheduler.h/.c` - the library. `ps_request {request_id, priority, request_time, status, team_id}`, `ps_team {team_id, availability, current_task}`, `ps_compare` (priority, then request time, then id), `ps_select_next`, `ps_find_available_team`, `ps_assign`, `ps_schedule_round`, `ps_complete`, `ps_pending_sorted`, `ps_validate`.
- `scheduler_cli.c` - the `ecosched_scheduler` program: reads the state from stdin, runs `run`, `queue` or `complete <id>`, prints the decision.
- `test_scheduler.c`, `tests/cli_test.sh` - 40 + 13 automated tests.

Non-preemption is structural: `ps_schedule_round` only ever changes `PENDING` requests and `AVAILABLE` teams. It has no code path that takes a team away from an active request.

Complexity: selecting the best request scans the pending list, O(n) per assignment, O(n x teams) per round, which is fine for the expected size. A binary heap would give O(log n) if the queue became very large.

## 6. DBMS <-> OS integration

- **Method:** a process bridge (CLI). Spring Boot starts `ecosched_scheduler` for each call and talks to it over stdin/stdout in a simple text format. There is no extra server, no JNI, and the C code stays testable on its own.
- **Real data:** the scheduler's input is built from `pickup_requests` and `collection_teams`; nothing is hardcoded.
- **Atomic update (also see `docs/DBMS.md` section 9):** `SchedulerService.run()` is one `@Transactional` method. It does `SELECT ... FOR UPDATE` on teams and open requests (consistent order: teams first), calls C, then updates requests and teams. If anything fails, the transaction rolls back and the database is unchanged. Two admins clicking at once are serialised by the locks, so a team can never get two requests.
- **DBMS side of resource management:** the CHECK constraints reject `ASSIGNED` without a team and `PENDING` with a team. A team's state is stored on both sides (`collection_teams.status/current_task` and `pickup_requests.team_id/status`); a CHECK, a composite foreign key, a unique generated column and two triggers keep them consistent (`docs/DBMS.md` section 8). The assignment writes four columns in the order request first, team second; completion and cancellation release the team first.
- **Visible in the UI:** the Scheduler page shows the pipeline MySQL -> pending requests -> priority scheduler -> highest-priority request -> available team -> assignment -> MySQL UPDATE. Each box is filled from `GET /api/scheduler/queue` and `GET /api/scheduler/status` (including `last_run`); the browser computes no scheduling result. "DB consistency: OK" is `v_integrity_violations` having 0 rows.
- **Request lifecycle:** `PENDING -> ASSIGNED` (scheduler) `-> IN_PROGRESS` (Start) `-> COMPLETED` (Complete). `CANCELLED` is possible from any open state and releases the team. Only `PENDING -> ASSIGNED` is a scheduling decision made by the C program; Start/Cancel are plain state changes in Java.
- **Time:** `request_time` is sent as UTC epoch seconds. MySQL `DATETIME` has second precision, so two requests created within the same second tie on time and are ordered by `request_id`.
- **Deployment note:** the backend must be able to execute the compiled binary (`cd scheduler && make`). If it cannot, scheduler endpoints answer 503 with a clear message; the rest of the API keeps working.

## 7. Interrupt concept

An **interrupt** is a signal that makes the CPU pause what it is doing to handle an event (timer tick, keyboard, disk finished). Preemptive schedulers rely on the timer interrupt to take the CPU from a running process. EcoSched has no hardware interrupts and, being non-preemptive, never forces a team off a job. The closest analogy is an *urgent request arriving*: it is an event, but it is handled by queueing it with high priority, not by interrupting the running pickup. A future "emergency override" (for example a hazardous leaking battery) would be the application-level equivalent of an interrupt and would need a deliberate preemption policy.

## 8. Deadlock concept and why it is future work

**Deadlock:** a set of processes each hold a resource and wait for a resource held by another, so none can proceed. It needs four conditions together (Coffman): mutual exclusion, hold and wait, no preemption, circular wait. Handling strategies: prevention, avoidance (Banker's algorithm), detection and recovery, or ignoring it.

**In EcoSched today deadlock cannot occur**, because every request needs exactly **one** resource (one team) and a team is never held while waiting for something else: there is no hold-and-wait and no circular wait. Deadlock becomes possible only if requests start needing several resources at once, for example a team **and** a special vehicle **and** a hazardous-waste handling licence, acquired one by one. Deadlock prevention/avoidance is therefore **intentionally not implemented** and is listed as future work (together with aging and multi-resource allocation).

## 9. Limits (be honest in the viva)

- It is an application scheduler, not a kernel scheduler; it runs when an admin (or later a timer) triggers it, not on every clock tick.
- No aging yet, so a permanently low-priority request can starve if urgent requests keep arriving.
- No distance/route optimisation, no team capacity or skills, no `IN_PROGRESS` start endpoint (an `ASSIGNED` request can be completed directly).
- No deadlock handling (see section 8).
