# EcoSched Priority Scheduler (C)

Non-preemptive priority scheduling applied to pickup requests. This is an **application-level scheduler**
that uses an Operating Systems idea; it is **not** an OS kernel.

| OS concept | EcoSched |
|---|---|
| Process / task | Pickup request |
| Ready queue | Pending pickup requests (`status = PENDING`) |
| CPU scheduler | `priority_scheduler.c` |
| CPU | Collection team (the resource) |
| Dispatch | Assign a team to a request (`ASSIGNED`, team `BUSY`) |
| Process completion | Pickup completion (`COMPLETED`, team `AVAILABLE`) |

Rule: **higher number = higher priority**. Ties: earlier `request_time` first (then lower `request_id`, so the
order is always deterministic). A request that already has a team is never interrupted.

## Files

| File | Purpose |
|---|---|
| `priority_scheduler.h/.c` | The scheduler library: structs, compare, select, assign, complete, validate |
| `scheduler_cli.c` | `ecosched_scheduler` program that Spring Boot starts (stdin/stdout protocol) |
| `test_scheduler.c` | 40 unit tests of the library |
| `tests/cli_test.sh` | 13 tests of the stdin/stdout protocol |
| `Makefile` | build + test |

## Build, test, run

```bash
cd scheduler
make            # builds ./ecosched_scheduler   (gcc -Wall -Wextra -Wpedantic -std=c11 -O2)
make test       # builds and runs test_scheduler + tests/cli_test.sh
make clean
```

Without make: `gcc -Wall -Wextra -std=c11 -O2 -o ecosched_scheduler scheduler_cli.c priority_scheduler.c`

Manual run (4 requests, priorities 3,5,2,4, one team):

```bash
printf 'TEAM 1 AVAILABLE\nREQUEST 1 3 1000 PENDING -\nREQUEST 2 5 1001 PENDING -\nREQUEST 3 2 1002 PENDING -\nREQUEST 4 4 1003 PENDING -\n' | ./ecosched_scheduler run
```
```
ASSIGN 2 1 5 1001
WAITING 1 4 4 1003
WAITING 2 1 3 1000
WAITING 3 3 2 1002
SUMMARY assigned=1 pending=3 available_teams=0 busy_teams=1
```

## Data structures (`priority_scheduler.h`)

- `ps_request { request_id, priority, request_time, status, team_id }`
- `ps_team { team_id, availability (AVAILABLE|BUSY), current_task }`
- `ps_system` holds growable arrays of both (the pending queue is the set of `PENDING` requests, ordered by `ps_compare`).

Main functions: `ps_compare`, `ps_select_next`, `ps_team_is_available`, `ps_find_available_team`, `ps_assign`,
`ps_schedule_round`, `ps_complete`, `ps_pending_sorted`, `ps_validate`.

Behaviour:
- A BUSY team (or one that holds an active request) is never given another request (`ps_assign` returns `PS_ERR_TEAM_BUSY`).
- `ps_schedule_round` repeats "best pending request -> free team" until teams or requests run out. 10 requests + 2 teams = 2 assigned, 8 stay PENDING.
- Completion sets the request `COMPLETED`, the team `AVAILABLE` and clears `current_task`.
- A higher-priority request that arrives later just joins the queue; running requests are untouched (non-preemptive).
- `ps_finalize` / `ps_validate` detect inconsistent data (for example one team with two active requests).

## CLI protocol (used by Spring Boot)

`ecosched_scheduler run | queue | complete <request_id>`; state on stdin, one record per line:

```
TEAM    <team_id> <AVAILABLE|BUSY>
REQUEST <request_id> <priority 1-10> <request_time_epoch_seconds_UTC> <PENDING|ASSIGNED|IN_PROGRESS|COMPLETED|CANCELLED> <team_id or ->
```

Output: `ASSIGN <req> <team> <priority> <epoch>`, `WAITING <rank> <req> <priority> <epoch>`,
`SUMMARY assigned= pending= available_teams= busy_teams=` (run); `QUEUE <rank> <req> <priority> <epoch>` (queue);
`COMPLETED <req> <team>` (complete). Errors: `ERROR <message>` and exit code 2 (bad input/data) or 3 (rule rejected).

The program never touches the database. Spring Boot reads MySQL, calls the program, and writes the result back.
