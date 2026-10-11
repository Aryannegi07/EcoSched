/* EcoSched - Non-preemptive Priority Scheduler. See priority_scheduler.h. */
#include "priority_scheduler.h"

#include <stdlib.h>
#include <string.h>

static int is_active(ps_request_status s) { return s == PS_ASSIGNED || s == PS_IN_PROGRESS; }

void ps_init(ps_system *s) { memset(s, 0, sizeof *s); }

void ps_free(ps_system *s) {
    free(s->requests);
    free(s->teams);
    memset(s, 0, sizeof *s);
}

ps_request *ps_find_request(ps_system *s, long id) {
    for (size_t i = 0; i < s->n_requests; i++)
        if (s->requests[i].request_id == id) return &s->requests[i];
    return NULL;
}

ps_team *ps_find_team(ps_system *s, long id) {
    for (size_t i = 0; i < s->n_teams; i++)
        if (s->teams[i].team_id == id) return &s->teams[i];
    return NULL;
}

ps_result ps_add_request(ps_system *s, long id, int priority, long request_time,
                         ps_request_status status, long team_id) {
    if (id <= 0 || priority < 1 || priority > 10) return PS_ERR_BAD_INPUT;
    if (ps_find_request(s, id)) return PS_ERR_DUPLICATE_ID;
    if (s->n_requests == s->cap_requests) {
        size_t cap = s->cap_requests ? s->cap_requests * 2 : 16;
        ps_request *p = realloc(s->requests, cap * sizeof *p);
        if (!p) return PS_ERR_NOMEM;
        s->requests = p;
        s->cap_requests = cap;
    }
    ps_request *r = &s->requests[s->n_requests++];
    r->request_id = id;
    r->priority = priority;
    r->request_time = request_time;
    r->status = status;
    r->team_id = (status == PS_PENDING) ? PS_NO_TEAM : team_id;
    return PS_OK;
}

ps_result ps_add_team(ps_system *s, long id, ps_team_availability availability) {
    if (id <= 0) return PS_ERR_BAD_INPUT;
    if (ps_find_team(s, id)) return PS_ERR_DUPLICATE_ID;
    if (s->n_teams == s->cap_teams) {
        size_t cap = s->cap_teams ? s->cap_teams * 2 : 8;
        ps_team *p = realloc(s->teams, cap * sizeof *p);
        if (!p) return PS_ERR_NOMEM;
        s->teams = p;
        s->cap_teams = cap;
    }
    ps_team *t = &s->teams[s->n_teams++];
    t->team_id = id;
    t->availability = availability;
    t->current_task = PS_NO_TASK;
    return PS_OK;
}

ps_result ps_finalize(ps_system *s) {
    for (size_t i = 0; i < s->n_requests; i++) {
        ps_request *r = &s->requests[i];
        if (!is_active(r->status)) continue;
        ps_team *t = ps_find_team(s, r->team_id);
        if (!t) return PS_ERR_NOT_FOUND;
        if (t->current_task != PS_NO_TASK) return PS_ERR_TEAM_CONFLICT;
        t->current_task = r->request_id;
        t->availability = PS_TEAM_BUSY;   /* a team with an active request is busy, whatever the stored flag says */
    }
    return PS_OK;
}

int ps_compare(const ps_request *a, const ps_request *b) {
    if (a->priority != b->priority) return (a->priority > b->priority) ? -1 : 1;  /* higher first */
    if (a->request_time != b->request_time) return (a->request_time < b->request_time) ? -1 : 1; /* earlier first */
    if (a->request_id != b->request_id) return (a->request_id < b->request_id) ? -1 : 1;
    return 0;
}

int ps_team_is_available(const ps_team *t) {
    return t->availability == PS_TEAM_AVAILABLE && t->current_task == PS_NO_TASK;
}

ps_request *ps_select_next(ps_system *s) {
    ps_request *best = NULL;
    for (size_t i = 0; i < s->n_requests; i++) {
        ps_request *r = &s->requests[i];
        if (r->status != PS_PENDING) continue;
        if (!best || ps_compare(r, best) < 0) best = r;
    }
    return best;
}

ps_team *ps_find_available_team(ps_system *s) {
    ps_team *best = NULL;
    for (size_t i = 0; i < s->n_teams; i++) {
        ps_team *t = &s->teams[i];
        if (!ps_team_is_available(t)) continue;
        if (!best || t->team_id < best->team_id) best = t;
    }
    return best;
}

ps_result ps_assign(ps_system *s, ps_request *r, ps_team *t) {
    (void)s;
    if (r->status != PS_PENDING) return PS_ERR_REQUEST_NOT_PENDING;
    if (!ps_team_is_available(t)) return PS_ERR_TEAM_BUSY;   /* a busy team never gets a second request */
    r->status = PS_ASSIGNED;
    r->team_id = t->team_id;
    t->availability = PS_TEAM_BUSY;
    t->current_task = r->request_id;
    return PS_OK;
}

size_t ps_schedule_round(ps_system *s, ps_assignment *out, size_t max_out) {
    size_t made = 0;
    for (;;) {
        ps_team *t = ps_find_available_team(s);
        if (!t) break;                       /* all teams busy: nothing may be dispatched */
        ps_request *r = ps_select_next(s);
        if (!r) break;                       /* ready queue empty */
        if (ps_assign(s, r, t) != PS_OK) break;
        if (out && made < max_out) {
            out[made].request_id = r->request_id;
            out[made].team_id = t->team_id;
            out[made].priority = r->priority;
            out[made].request_time = r->request_time;
        }
        made++;
    }
    return made;
}

ps_result ps_complete(ps_system *s, long request_id, long *team_id_out) {
    ps_request *r = ps_find_request(s, request_id);
    if (!r) return PS_ERR_NOT_FOUND;
    if (!is_active(r->status)) return PS_ERR_REQUEST_NOT_ACTIVE;
    ps_team *t = ps_find_team(s, r->team_id);
    if (!t) return PS_ERR_NOT_FOUND;
    if (team_id_out) *team_id_out = t->team_id;
    r->status = PS_COMPLETED;
    t->availability = PS_TEAM_AVAILABLE;
    t->current_task = PS_NO_TASK;
    return PS_OK;
}

static int cmp_ptr(const void *x, const void *y) {
    return ps_compare(*(const ps_request *const *)x, *(const ps_request *const *)y);
}

size_t ps_pending_sorted(ps_system *s, const ps_request **out, size_t max_out) {
    size_t n = 0;
    for (size_t i = 0; i < s->n_requests; i++)
        if (s->requests[i].status == PS_PENDING && n < max_out) out[n++] = &s->requests[i];
    qsort(out, n, sizeof *out, cmp_ptr);
    return n;
}

size_t ps_count_pending(const ps_system *s) {
    size_t n = 0;
    for (size_t i = 0; i < s->n_requests; i++) if (s->requests[i].status == PS_PENDING) n++;
    return n;
}

size_t ps_count_available_teams(const ps_system *s) {
    size_t n = 0;
    for (size_t i = 0; i < s->n_teams; i++) if (ps_team_is_available(&s->teams[i])) n++;
    return n;
}

ps_result ps_validate(const ps_system *s) {
    for (size_t i = 0; i < s->n_teams; i++) {
        const ps_team *t = &s->teams[i];
        size_t active = 0;
        for (size_t j = 0; j < s->n_requests; j++) {
            const ps_request *r = &s->requests[j];
            if (is_active(r->status) && r->team_id == t->team_id) {
                active++;
                if (t->current_task != r->request_id) return PS_ERR_TEAM_CONFLICT;
            }
        }
        if (active > 1) return PS_ERR_TEAM_CONFLICT;
        if (active == 0 && t->current_task != PS_NO_TASK) return PS_ERR_TEAM_CONFLICT;
        if (active == 1 && t->availability != PS_TEAM_BUSY) return PS_ERR_TEAM_CONFLICT;
    }
    for (size_t j = 0; j < s->n_requests; j++) {
        const ps_request *r = &s->requests[j];
        if (r->status == PS_PENDING && r->team_id != PS_NO_TEAM) return PS_ERR_TEAM_CONFLICT;
    }
    return PS_OK;
}

const char *ps_result_message(ps_result r) {
    switch (r) {
        case PS_OK: return "ok";
        case PS_ERR_NOMEM: return "out of memory";
        case PS_ERR_DUPLICATE_ID: return "duplicate id";
        case PS_ERR_NOT_FOUND: return "request or team not found";
        case PS_ERR_BAD_INPUT: return "bad input value";
        case PS_ERR_REQUEST_NOT_PENDING: return "request is not PENDING";
        case PS_ERR_TEAM_BUSY: return "team is busy";
        case PS_ERR_REQUEST_NOT_ACTIVE: return "request is not ASSIGNED or IN_PROGRESS";
        case PS_ERR_TEAM_CONFLICT: return "inconsistent state: a team holds more than one active request";
    }
    return "unknown error";
}

static const char *const STATUS_NAMES[] = {"PENDING", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"};

const char *ps_request_status_name(ps_request_status s) { return STATUS_NAMES[s]; }

int ps_request_status_parse(const char *name, ps_request_status *out) {
    for (int i = 0; i < 5; i++)
        if (strcmp(name, STATUS_NAMES[i]) == 0) { *out = (ps_request_status)i; return 1; }
    return 0;
}
