/*
 * EcoSched - Non-preemptive Priority Scheduler (C)
 *
 * An Operating Systems concept applied inside an application (NOT a kernel):
 *   process / task      -> pickup request
 *   ready queue         -> pending pickup requests
 *   CPU                 -> collection team (the resource)
 *   dispatch            -> assigning a team to a request
 *   process completion  -> pickup completion
 *
 * Rule: HIGHER numeric priority runs first. Ties: earlier request_time first
 * (then lower request_id so the order is always deterministic).
 * Non-preemptive: a request that already has a team is never interrupted.
 */
#ifndef ECOSCHED_PRIORITY_SCHEDULER_H
#define ECOSCHED_PRIORITY_SCHEDULER_H

#include <stddef.h>

#define PS_NO_TASK (-1L)   /* team.current_task value when the team is idle   */
#define PS_NO_TEAM (-1L)   /* request.team_id value when no team is assigned */

typedef enum {
    PS_PENDING = 0,
    PS_ASSIGNED,
    PS_IN_PROGRESS,
    PS_COMPLETED,
    PS_CANCELLED
} ps_request_status;

typedef enum {
    PS_TEAM_AVAILABLE = 0,
    PS_TEAM_BUSY
} ps_team_availability;

typedef enum {
    PS_OK = 0,
    PS_ERR_NOMEM,
    PS_ERR_DUPLICATE_ID,
    PS_ERR_NOT_FOUND,
    PS_ERR_BAD_INPUT,
    PS_ERR_REQUEST_NOT_PENDING,
    PS_ERR_TEAM_BUSY,
    PS_ERR_REQUEST_NOT_ACTIVE,
    PS_ERR_TEAM_CONFLICT        /* a team holds two active requests */
} ps_result;

typedef struct {
    long              request_id;
    int               priority;       /* higher number = higher priority */
    long              request_time;   /* seconds since epoch (UTC)       */
    ps_request_status status;
    long              team_id;        /* PS_NO_TEAM while PENDING        */
} ps_request;

typedef struct {
    long                 team_id;
    ps_team_availability availability;
    long                 current_task; /* request_id being handled, or PS_NO_TASK */
} ps_team;

/* One assignment made by a scheduling round. */
typedef struct {
    long request_id;
    long team_id;
    int  priority;
    long request_time;
} ps_assignment;

typedef struct {
    ps_request *requests;
    size_t      n_requests, cap_requests;
    ps_team    *teams;
    size_t      n_teams, cap_teams;
} ps_system;

/* ---- lifecycle ---- */
void      ps_init(ps_system *s);
void      ps_free(ps_system *s);

/* ---- loading state (copies the data) ---- */
ps_result ps_add_request(ps_system *s, long id, int priority, long request_time,
                         ps_request_status status, long team_id);
ps_result ps_add_team(ps_system *s, long id, ps_team_availability availability);

/* After loading: links every ASSIGNED/IN_PROGRESS request to its team, marks that team
 * BUSY and sets current_task. Fails with PS_ERR_TEAM_CONFLICT / PS_ERR_NOT_FOUND if the
 * data is inconsistent (two active requests on one team, unknown team). */
ps_result ps_finalize(ps_system *s);

/* ---- lookups ---- */
ps_request *ps_find_request(ps_system *s, long id);
ps_team    *ps_find_team(ps_system *s, long id);

/* ---- scheduling ---- */
/* <0: a runs before b; >0: b runs before a. Priority DESC, request_time ASC, id ASC. */
int         ps_compare(const ps_request *a, const ps_request *b);
int         ps_team_is_available(const ps_team *t);
/* Highest-priority PENDING request, or NULL when the queue is empty. */
ps_request *ps_select_next(ps_system *s);
/* First AVAILABLE team (lowest team_id in load order), or NULL. */
ps_team    *ps_find_available_team(ps_system *s);
/* Assign one team to one request. Refuses if the team is busy or the request is not PENDING. */
ps_result   ps_assign(ps_system *s, ps_request *r, ps_team *t);
/* One scheduling round: repeat "pick best pending request, give it a free team" until there is
 * no free team or no pending request. Never touches running requests (non-preemptive).
 * Writes up to max_out assignments to out (may be NULL) and returns how many were made. */
size_t      ps_schedule_round(ps_system *s, ps_assignment *out, size_t max_out);
/* Completion: request -> COMPLETED, team -> AVAILABLE, current_task cleared. */
ps_result   ps_complete(ps_system *s, long request_id, long *team_id_out);

/* ---- queue view ---- */
/* Fills out[] with pointers to PENDING requests in scheduling order; returns the count. */
size_t      ps_pending_sorted(ps_system *s, const ps_request **out, size_t max_out);
size_t      ps_count_pending(const ps_system *s);
size_t      ps_count_available_teams(const ps_system *s);

/* Invariant check used by the tests and the CLI: no team has two active requests, every active
 * request's team points back at it, and every BUSY team that has a task is consistent. */
ps_result   ps_validate(const ps_system *s);

const char *ps_result_message(ps_result r);
const char *ps_request_status_name(ps_request_status s);
int         ps_request_status_parse(const char *name, ps_request_status *out);

#endif /* ECOSCHED_PRIORITY_SCHEDULER_H */
