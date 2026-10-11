# EcoSched - Viva Questions and Answers (beginner friendly)

Short answers first; say them in your own words. "In EcoSched" lines connect theory to your project.
Be honest about limits (last section) - examiners respect that.

---

## 1. Project

**Q1. What is EcoSched?**
A web system where citizens register old electronic items (e-waste) and request a pickup. Collection teams are given those
requests automatically by a **priority scheduler written in C**. Everything is stored in **MySQL**, the API is **Spring Boot**,
the screens are **React**.

**Q2. Why e-waste?**
E-waste (old phones, laptops, batteries) is one of the fastest growing waste types and contains toxic metals. Collection is
limited (few teams, many requests), so *who is served first* is a real scheduling problem.

**Q3. Why Operating Systems (OS)?**
Because the core problem is an OS problem: many requests (processes) compete for few teams (resources/CPUs). The OS idea of
**CPU scheduling** decides the order.

**Q4. Why DBMS?**
Requests, users, items and teams must be stored safely, related to each other, and never become inconsistent (e.g. a team
with two jobs). A DBMS gives keys, constraints and transactions for that.

**Q5. How are OS and DBMS connected?**
The database holds the state (which request is waiting, which team is free). The C scheduler reads that state, **decides**
who gets which team, and the result is written back **in one transaction**. OS = decision, DBMS = memory + safety.
Flow: `React -> Spring Boot -> (reads MySQL) -> C scheduler -> Spring Boot -> (writes MySQL)`.

---

## 2. Operating System

**Q6. What is a kernel?**
The core of an OS. It manages the CPU, memory, files and devices, and lets programs use them safely.

**Q7. What is a process?**
A program that is running (program + its current state). *In EcoSched:* a pickup request waiting for / using a team.

**Q8. What is a thread?**
A lighter unit of execution inside a process; threads of one process share memory. *Example:* Spring Boot's web server
handles each HTTP request in a thread.

**Q9. Process vs thread?**
Process = own memory, heavier. Thread = shares the process memory, lighter, faster to create.

**Q10. What is CPU scheduling?**
Choosing which ready process gets the CPU next. Goal: good use of the CPU and fair/short waiting times.

**Q11. What is Priority Scheduling?**
Every process has a priority; the one with the highest priority runs first. *In EcoSched:* priority 1-10, **higher number =
higher priority**; ties go to the **earlier request_time** (first come, first served).

**Q12. Preemptive vs non-preemptive?**
Preemptive: the OS can take the CPU away from a running process when a more important one arrives.
Non-preemptive: a running process keeps the CPU until it finishes.
*EcoSched is non-preemptive:* a team already driving to a pickup is never pulled off for a new priority-10 request.
(Verified: `workflow_test.py` -> "priority-10 request stays PENDING, no running job is interrupted".)

**Q13. Why non-preemptive here?**
A garbage truck cannot stop half-way and switch jobs. Interrupting would waste fuel and time.

**Q14. What is a ready queue?**
The list of processes waiting for the CPU. *In EcoSched:* requests with status `PENDING`, sorted by priority (then time).
Shown on the Scheduler page and returned by `GET /api/scheduler/queue`.

**Q15. What is resource allocation?**
Giving a limited resource (CPU, memory, a printer) to a process. *In EcoSched:* giving a **collection team** to a request.

**Q16. What is a deadlock?**
Processes wait for each other forever (each holds something the other needs). Four conditions: mutual exclusion, hold and
wait, no preemption, circular wait.
*In EcoSched:* a team holds only one request at a time and requests need only one team, so there is no circular wait.
In the database, locks are always taken in the **same order** (teams, then requests) so two scheduler runs cannot deadlock.

**Q17. What is an interrupt?**
A signal that makes the CPU stop what it is doing and handle an event (key press, timer, disk ready).
*Analogy in EcoSched:* clicking **Complete** or a new urgent request arriving is an "event"; but because we are
non-preemptive, a new request does *not* interrupt running work, it only changes the queue.

**Q18. What is starvation? Does it happen here?**
A low-priority process waits forever because higher ones keep arriving. Yes, it *can* happen in EcoSched (future work: aging -
slowly raise the priority of old requests).

---

## 3. Project mapping (OS term -> EcoSched)

| OS term | In EcoSched |
|---------|-------------|
| Process | a pickup request (`pickup_requests` row) |
| Resource / CPU | a collection team (`collection_teams` row) |
| Scheduler | `scheduler/priority_scheduler.c` (run through `scheduler_cli.c`) |
| Ready queue | requests with status `PENDING` ordered by priority DESC, request_time ASC |
| Running state | request `ASSIGNED` / `IN_PROGRESS`, team `BUSY` |
| Terminated | request `COMPLETED` (or `CANCELLED`) |
| Dispatcher | the Spring Boot `SchedulerService` that applies the C output to MySQL |
| Context switch | does not exist (non-preemptive) |

**Q19. What happens when all teams are busy?**
The scheduler assigns nothing. Requests stay `PENDING`. When a team finishes (**Complete**), it becomes `AVAILABLE` and the next
scheduler run gives it the highest-priority pending request.
*Tested:* 2 teams, 5 requests -> 2 active assignments, 3 pending, no team with two active requests.

**Q20. How do you guarantee a team never has two requests?**
Three layers: (1) the C scheduler only picks `AVAILABLE` teams; (2) the service locks the rows (`SELECT ... FOR UPDATE`);
(3) MySQL itself refuses it - a UNIQUE index on the generated column `active_team_id`. Error seen in testing:
`Duplicate entry '1' for key 'pickup_requests.uq_requests_active_team'`.

**Q21. Why is the scheduler in C?**
The OS part of the course is traditionally C; it shows data structures and sorting without a framework. The C program is a
small command-line tool: it reads text from stdin and prints decisions to stdout, so Java can call it as a process.

**Q22. How does Java talk to C?**
`SchedulerBridge.java` starts `ecosched_scheduler run`, writes lines like `TEAM 1 AVAILABLE` and `REQUEST 5 5 <time> PENDING -`
to its stdin, and reads `ASSIGN 5 1 ...` lines from stdout. Exit code 0 = ok, 2/3 = rejected, other = failure.

---

## 4. DBMS

**Q23. What is a primary key?**
A column (or columns) that uniquely identifies each row and is never NULL. *Example:* `pickup_requests.request_id`.

**Q24. What is a foreign key?**
A column that points to the primary key of another table and keeps the data consistent.
*Example:* `pickup_requests.user_id -> users.user_id`. You cannot create a request for a user who does not exist
(`ERROR 1452` in our test).

**Q25. What is a composite foreign key and why do you use one?**
A foreign key made of two columns. `(item_id, user_id)` guarantees a request can only use an item that belongs to the *same
user*. Tested: using another user's item is refused.

**Q26. What is normalization?**
Splitting data into tables so that each fact is stored once (less repetition, no update anomalies).
EcoSched is in **3NF**: user details live only in `users`, item details only in `e_waste`, etc. A request stores `user_id`,
not the user's name and e-mail again.

**Q27. What is a JOIN?**
Combining rows of two or more tables using a related column.
```sql
SELECT u.full_name, e.item_name, r.priority, r.status, t.team_name
FROM pickup_requests r
JOIN users u   ON u.user_id = r.user_id
JOIN e_waste e ON e.item_id = r.item_id
LEFT JOIN collection_teams t ON t.team_id = r.team_id;
```
`LEFT JOIN` is used for the team because a pending request has no team yet.

**Q28. What is a transaction? What are ACID properties?**
A group of SQL statements that succeed or fail **together**. Atomicity, Consistency, Isolation, Durability.
*In EcoSched:* an assignment = 4 updates (request team, request status, team status, team current_task). If any fails,
all are rolled back. Tested: a failing second step + `ROLLBACK` also undid the first step.

**Q29. What are constraints? Give examples.**
Rules the database enforces: `NOT NULL`, `UNIQUE` (email), `CHECK` (priority between 1 and 10; weight > 0),
`PRIMARY KEY`, `FOREIGN KEY`, `DEFAULT`.

**Q30. What is an index? Which do you use?**
A sorted lookup structure that makes searches faster (like a book index). `idx_requests_status_priority_time` speeds up
"pending requests ordered by priority, then time" - `EXPLAIN` shows MySQL uses it. Trade-off: indexes use space and slow
inserts slightly.

**Q31. Why can deleting a user fail?**
`ON DELETE RESTRICT` on the foreign keys. A user who owns requests cannot be deleted, which protects history (error 1451).

**Q32. Why MySQL?**
Free, popular, supports InnoDB (transactions, foreign keys, row locks) and CHECK constraints (8.0.16+), works with Spring Boot
and MySQL Workbench. (We do not use PostgreSQL or MongoDB.)

**Q33. What is `SELECT ... FOR UPDATE`?**
It locks the selected rows until the transaction ends, so two scheduler runs at the same time cannot assign the same request.
Tested: 6 simultaneous runs with 2 free teams produced exactly 2 assignments.

---

## 5. Technology

**Q34. Why React?** Component-based UI, fast updates without page reloads, huge community; the dashboards refresh the data automatically.

**Q35. Why Spring Boot?** Quickly builds REST APIs in Java; auto-configuration, built-in validation, JPA/Hibernate for the database, embedded Tomcat server.

**Q36. Why Maven?** Downloads libraries automatically (`pom.xml`) and builds the project with `mvn clean package`.

**Q37. Why C for the scheduler?** See Q21 - OS-level logic, small, fast, no runtime needed, easy to test on its own (53 tests).

**Q38. Why a REST API?** A standard way (HTTP + JSON) for the React app and the backend to talk, so each side can be developed and tested separately.
Examples: `POST /api/scheduler/run`, `PUT /api/requests/{id}/complete`.

**Q39. What is CORS and why did you configure it?**
Browsers block a page on `localhost:3000` from calling `localhost:8080` unless the server allows that origin.
`WebConfig.java` allows the origins listed in `CORS_ALLOWED_ORIGINS`.

**Q40. Why MySQL Workbench?** A visual tool to run the `.sql` files, look at tables, and draw the ER diagram - useful for demos and debugging.

**Q41. Why keep the password in `.env`?** Passwords must never be written in source code or committed. `.env` is git-ignored; `.env.example` shows the variable names only.

**Q42. What is JPA / Hibernate?** JPA is the Java standard for mapping classes to tables; Hibernate is the implementation. We write `repository.save(x)` instead of SQL for simple cases.

---

## 6. Honest limits (say these before they ask)

* Non-preemptive only; no aging, so starvation is possible.
* One scheduler run assigns as many requests as there are free teams; there is no travel distance or time-slot logic yet.
* No login/roles yet (anyone can call the API).
* The scheduler runs when someone clicks **Run Scheduler** (or calls the API); it is not yet automatic/periodic.
* Deadlock is avoided by design and consistent lock order, not by a deadlock-detection algorithm.

## 7. Quick demo script (2 minutes)

1. Open `/scheduler`: queue shows pending requests ordered by priority.
2. **Run Scheduler**: highest-priority requests get the free teams; teams turn BUSY.
3. **Run Scheduler** again: nothing happens, all teams busy (non-preemptive).
4. **Complete** one request: its team becomes AVAILABLE.
5. **Run Scheduler**: the freed team gets the highest remaining priority.
6. Open `/admin`: the same numbers, computed by MySQL (`COUNT`, `GROUP BY`).
