# EcoSched REST API

Base URL: `http://localhost:8080` (change with `SERVER_PORT`). All bodies are JSON (`Content-Type: application/json`).

## Conventions

- **Field names are `snake_case`** (`user_id`, `request_time`, ...).
- Date-times are ISO-8601 without timezone, e.g. `2026-10-01T09:00:00`.
- Create endpoints return **201 Created** with the saved record.
- The server sets `id`s, `created_at`, `request_time`, request `status` and `team_id`. If a client sends them anyway they are ignored.
- No authentication yet (planned for a later chat).

### Error format

Every error uses the same body:

```json
{
  "timestamp": "2026-10-07T10:15:30.123",
  "status": 400,
  "error": "Bad Request",
  "message": "Validation failed",
  "path": "/api/users",
  "field_errors": { "email": "email must be a valid email address" }
}
```

`field_errors` appears only for validation errors (400).

| HTTP | When |
|------|------|
| 400 | Validation failed, malformed JSON, invalid enum value, bad path id (`/api/users/abc`), item does not belong to the user |
| 404 | User / item / request not found, or unknown URL |
| 405 | HTTP method not supported on that URL |
| 409 | Duplicate email, duplicate team name, item already has an open request, database constraint clash |
| 500 | Unexpected server error (details are only in the server log) |

### Enums

| Name | Values |
|------|--------|
| Request status | `PENDING`, `ASSIGNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED` |
| Team status | `AVAILABLE`, `BUSY` |
| E-waste category | `LAPTOP`, `MOBILE`, `TABLET`, `BATTERY`, `TV_MONITOR`, `APPLIANCE`, `ACCESSORY`, `OTHER` |
| Item condition | `WORKING`, `DAMAGED`, `NON_WORKING` |

---

## Users

### POST /api/users

| Field | Required | Rules |
|-------|----------|-------|
| `full_name` | yes | not blank, max 100 |
| `email` | yes | valid email, max 150, unique (stored lower-case) |
| `phone` | yes | 10 to 13 digits, optional leading `+` |
| `address` | yes | not blank, max 255 |

```bash
curl -X POST http://localhost:8080/api/users -H "Content-Type: application/json" \
  -d '{"full_name":"Riya Sharma","email":"riya@example.com","phone":"9876500001","address":"12 Rajpur Road, Dehradun"}'
```

```json
{ "user_id": 6, "full_name": "Riya Sharma", "email": "riya@example.com",
  "phone": "9876500001", "address": "12 Rajpur Road, Dehradun", "created_at": "2026-10-07T10:15:30.123" }
```

Errors: 400 (validation), 409 (email already exists).

### GET /api/users
Returns an array of all users.

### GET /api/users/{id}
Returns one user. 404 if the id does not exist, 400 if `id` is not a number.

---

## E-waste

### POST /api/ewaste

| Field | Required | Rules |
|-------|----------|-------|
| `user_id` | yes | must be an existing user |
| `item_name` | yes | not blank, max 100 |
| `category` | yes | one of the categories above |
| `item_condition` | no | default `NON_WORKING` |
| `quantity` | no | 1 to 1000, default 1 |
| `weight_kg` | yes | 0.01 to 99999.99 |
| `description` | no | max 255 |

```bash
curl -X POST http://localhost:8080/api/ewaste -H "Content-Type: application/json" \
  -d '{"user_id":1,"item_name":"Old Laptop","category":"LAPTOP","weight_kg":2.5}'
```

```json
{ "item_id": 9, "user_id": 1, "item_name": "Old Laptop", "category": "LAPTOP",
  "item_condition": "NON_WORKING", "quantity": 1, "weight_kg": 2.5,
  "description": null, "created_at": "2026-10-07T10:16:00.000" }
```

Errors: 400 (validation / bad enum), 404 (unknown `user_id`).

### GET /api/ewaste
Returns an array of all items.

### GET /api/ewaste/{id}
Returns one item. 404 if missing.

---

## Pickup requests

### POST /api/requests

| Field | Required | Rules |
|-------|----------|-------|
| `user_id` | yes | existing user |
| `item_id` | yes | existing item **owned by that user** |
| `location` | yes | not blank, max 255 |
| `priority` | no | 1 to 10, **higher number = higher priority**, default 1 |

Business rules: the item must belong to the user (400), and an item can have only one open request (`PENDING`, `ASSIGNED` or `IN_PROGRESS`) at a time (409). A new request always starts as `PENDING` with `team_id = null`.

```bash
curl -X POST http://localhost:8080/api/requests -H "Content-Type: application/json" \
  -d '{"user_id":5,"item_id":8,"location":"3 ISBT Colony, Dehradun","priority":7}'
```

```json
{ "request_id": 8, "user_id": 5, "item_id": 8, "location": "3 ISBT Colony, Dehradun",
  "priority": 7, "request_time": "2026-10-07T10:17:00.000", "status": "PENDING", "team_id": null }
```

### GET /api/requests
All requests (any status).

### GET /api/requests/{id}
One request. 404 if missing.

### GET /api/requests/pending
Only `PENDING` requests, **oldest first** (first come, first served).

### GET /api/requests/user/{userId}
All requests of one user, newest first (404 unknown user).

### PUT /api/requests/{id}/start
`ASSIGNED` -> `IN_PROGRESS`; the team stays BUSY on the same request. 404 unknown; 409 if the request is not ASSIGNED.

### PUT /api/requests/{id}/cancel
`PENDING`, `ASSIGNED` or `IN_PROGRESS` -> `CANCELLED`. If a team was working on it, the team is released (`AVAILABLE`, `current_task` NULL) in the same transaction. 404 unknown; 409 if already COMPLETED/CANCELLED.

### GET /api/requests/priority
Only `PENDING` requests as a **priority queue**: highest `priority` first, ties broken by oldest `request_time`. The C scheduler uses the same ordering.

> Interpretation note: the project brief lists both endpoints without defining the difference, so `/pending` = arrival order and `/priority` = priority order.

---

## Teams

### POST /api/teams

| Field | Required | Rules |
|-------|----------|-------|
| `team_name` | yes | not blank, max 100, unique |
| `contact_phone` | yes | 10 to 13 digits, optional leading `+` |
| `vehicle_number` | no | max 20 |
| `status` | no | only `AVAILABLE` is accepted (default). `BUSY` -> 400: a team is BUSY only while it works on a request, and only the scheduler assigns one |

```json
{ "team_id": 5, "team_name": "Green Squad Gamma", "contact_phone": "9811100005",
  "vehicle_number": null, "status": "AVAILABLE", "current_task": null, "created_at": "2026-10-07T10:18:00.000" }
```

Errors: 400 (validation), 409 (name already exists).

### GET /api/teams
All teams. `current_task` is the id of the request a BUSY team is working on (null when AVAILABLE).

### PUT /api/teams/{id}
Body: `team_name`, `contact_phone` (required), `vehicle_number` (optional) - same rules as POST. The status cannot be changed here. 200 + team; 400 validation; 404 unknown; 409 name taken.

### DELETE /api/teams/{id}
204 on success. 404 unknown; 409 if the team is BUSY or has any request in its history (foreign key `RESTRICT`).

### GET /api/teams/available
Teams with status `AVAILABLE`, sorted by name.

---

## Scheduler (C priority scheduler, non-preemptive)

Higher `priority` number = higher priority; equal priority -> earlier `request_time`. A request that already has a team is never interrupted.
If the C program (`scheduler/ecosched_scheduler`) is missing or crashes, these endpoints return **503**.

### POST /api/scheduler/run
No body. One scheduling round on the real database: every AVAILABLE team gets the best PENDING request. Requests become `ASSIGNED` (with `team_id`), teams become `BUSY`, all in one transaction. Teams/requests that are busy or active are not touched.
```json
{ "pending_before": 4, "assigned_count": 1, "pending_count": 3, "available_teams": 0, "busy_teams": 1,
  "assignments": [ { "request_id": 2, "team_id": 1, "team_name": "Team A", "priority": 5,
                     "request_time": "2026-10-01T09:30:00", "location": "...",
                     "request_status": "ASSIGNED", "team_status": "BUSY", "team_current_task": 2 } ],
  "message": "1 request(s) assigned", "ran_at": "2026-10-07T10:15:30.123" }
```
With every team busy: `assigned_count` is 0 and the message says so (still 200).

### GET /api/scheduler/queue
PENDING requests in the order the C scheduler will dispatch them: `[ { "rank": 1, "request_id": 2, "priority": 5, "request_time": "...", "location": "...", "status": "PENDING" } ]`

### GET /api/scheduler/status
`policy` (`NON_PREEMPTIVE_PRIORITY`), `engine_available`, counts of `pending_requests`, `assigned_requests`, `in_progress_requests`, `completed_requests`, `available_teams`, `busy_teams`, and:
- `teams[]`: `team_id`, `team_name`, `status`, `contact_phone`, `vehicle_number`, `current_task` (from `collection_teams`), `current_request_id` (derived from `pickup_requests`) and `current_priority`. The two ids must match - that is the OS <-> DBMS consistency made visible.
- `integrity_violations`: rows in the view `v_integrity_violations` (0 = consistent).
- `last_run`: the response of the most recent committed `POST /run` (or null). Kept in backend memory, so it is lost when the backend restarts.

### PUT /api/requests/{id}/complete
No body. The request must be `ASSIGNED` or `IN_PROGRESS`; it becomes `COMPLETED` and its team becomes `AVAILABLE`. Returns the request. 404 unknown id; 409 if the request is PENDING, COMPLETED or CANCELLED. Call `POST /api/scheduler/run` afterwards to dispatch the next request.

## Admin statistics

### GET /api/admin/stats
Everything is computed by MySQL (`COUNT`/`SUM`/`GROUP BY`):
```json
{ "total_users": 5, "total_ewaste_items": 8, "total_ewaste_units": 19, "total_ewaste_kg": 46.50,
  "pending_requests": 4, "assigned_requests": 1, "in_progress_requests": 1, "completed_requests": 1,
  "cancelled_requests": 1, "available_teams": 2, "busy_teams": 2, "integrity_violations": 0,
  "ewaste_by_category": [ { "category": "TV_MONITOR", "item_records": 1, "total_units": 1, "total_weight_kg": 14.50 } ],
  "generated_at": "2026-10-09T10:00:00.000" }
```
`total_ewaste_kg` is the sum of `e_waste.weight_kg`, `total_ewaste_units` the sum of `quantity`.

### GET /api/admin/ewaste-stats
Only the `ewaste_by_category` array.

## Testing the API

With the backend running and the database created:

```bash
bash backend/scripts/api-smoke-test.sh            # or pass a base URL as the first argument
```

It calls every endpoint above (happy paths and error cases) and prints PASS/FAIL per check; the exit code is non-zero if anything fails.
