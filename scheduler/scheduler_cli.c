/*
 * EcoSched scheduler CLI bridge.
 * Spring Boot starts this program, writes the current database state to stdin, reads the result
 * from stdout, and applies it to MySQL. The program itself never touches the database.
 *
 * Usage:  ecosched_scheduler run | queue | complete <request_id>
 *
 * stdin (one record per line; blank lines and lines starting with # are ignored):
 *   TEAM    <team_id> <AVAILABLE|BUSY>
 *   REQUEST <request_id> <priority 1-10> <request_time_epoch_seconds> <STATUS> <team_id or ->
 *
 * stdout:
 *   run      -> ASSIGN <request_id> <team_id> <priority> <epoch>      (one per assignment)
 *               WAITING <rank> <request_id> <priority> <epoch>        (still pending, in order)
 *               SUMMARY assigned=<n> pending=<n> available_teams=<n> busy_teams=<n>
 *   queue    -> QUEUE <rank> <request_id> <priority> <epoch>
 *   complete -> COMPLETED <request_id> <team_id>
 * Errors: "ERROR <message>" on stdout, exit code 2 (bad input) or 3 (rejected by scheduler rules).
 */
#include "priority_scheduler.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define EXIT_BAD_INPUT 2
#define EXIT_REJECTED  3

static int fail(int code, const char *msg, int line) {
    if (line > 0) printf("ERROR line %d: %s\n", line, msg);
    else printf("ERROR %s\n", msg);
    return code;
}

static int load_state(ps_system *sys) {
    char buf[512];
    int line = 0;
    while (fgets(buf, sizeof buf, stdin)) {
        line++;
        if (!strchr(buf, '\n') && !feof(stdin)) return fail(EXIT_BAD_INPUT, "line too long", line);
        char *p = buf;
        while (*p == ' ' || *p == '\t') p++;
        if (*p == '\0' || *p == '\n' || *p == '\r' || *p == '#') continue;

        char kind[16], status[32], team[32];
        long id, when;
        int prio;
        char extra;
        ps_result res;
        if (sscanf(p, "TEAM %ld %31s %c", &id, status, &extra) == 2) {
            ps_team_availability av;
            if (strcmp(status, "AVAILABLE") == 0) av = PS_TEAM_AVAILABLE;
            else if (strcmp(status, "BUSY") == 0) av = PS_TEAM_BUSY;
            else return fail(EXIT_BAD_INPUT, "team status must be AVAILABLE or BUSY", line);
            res = ps_add_team(sys, id, av);
        } else if (sscanf(p, "REQUEST %ld %d %ld %31s %31s %c", &id, &prio, &when, status, team, &extra) == 5) {
            ps_request_status st;
            if (!ps_request_status_parse(status, &st)) return fail(EXIT_BAD_INPUT, "unknown request status", line);
            long team_id = PS_NO_TEAM;
            if (strcmp(team, "-") != 0) {
                char *end;
                team_id = strtol(team, &end, 10);
                if (*end != '\0' || team_id <= 0) return fail(EXIT_BAD_INPUT, "team_id must be a positive number or -", line);
            }
            if ((st == PS_ASSIGNED || st == PS_IN_PROGRESS) && team_id == PS_NO_TEAM)
                return fail(EXIT_BAD_INPUT, "an ASSIGNED/IN_PROGRESS request needs a team_id", line);
            res = ps_add_request(sys, id, prio, when, st, team_id);
        } else {
            (void)kind;
            return fail(EXIT_BAD_INPUT, "unrecognised record", line);
        }
        if (res != PS_OK) return fail(EXIT_BAD_INPUT, ps_result_message(res), line);
    }
    ps_result r = ps_finalize(sys);
    if (r != PS_OK) return fail(EXIT_BAD_INPUT, ps_result_message(r), 0);
    return 0;
}

static void print_waiting(ps_system *sys, const char *tag) {
    const ps_request **q = malloc((sys->n_requests + 1) * sizeof *q);
    if (!q) return;
    size_t n = ps_pending_sorted(sys, q, sys->n_requests);
    for (size_t i = 0; i < n; i++)
        printf("%s %zu %ld %d %ld\n", tag, i + 1, q[i]->request_id, q[i]->priority, q[i]->request_time);
    free(q);
}

int main(int argc, char **argv) {
    if (argc < 2) return fail(EXIT_BAD_INPUT, "usage: ecosched_scheduler run | queue | complete <request_id>", 0);
    const char *cmd = argv[1];
    int is_run = strcmp(cmd, "run") == 0;
    int is_queue = strcmp(cmd, "queue") == 0;
    int is_complete = strcmp(cmd, "complete") == 0;
    if (!is_run && !is_queue && !is_complete) return fail(EXIT_BAD_INPUT, "unknown command (use run, queue or complete)", 0);

    long complete_id = 0;
    if (is_complete) {
        char *end;
        if (argc != 3) return fail(EXIT_BAD_INPUT, "complete needs a request id", 0);
        complete_id = strtol(argv[2], &end, 10);
        if (*end != '\0' || complete_id <= 0) return fail(EXIT_BAD_INPUT, "request id must be a positive number", 0);
    }

    ps_system sys;
    ps_init(&sys);
    int rc = load_state(&sys);
    if (rc) { ps_free(&sys); return rc; }

    if (is_queue) {
        print_waiting(&sys, "QUEUE");
    } else if (is_run) {
        size_t cap = sys.n_teams ? sys.n_teams : 1;
        ps_assignment *out = malloc(cap * sizeof *out);
        if (!out) { ps_free(&sys); return fail(EXIT_BAD_INPUT, "out of memory", 0); }
        size_t before_avail = ps_count_available_teams(&sys);
        (void)before_avail;
        size_t n = ps_schedule_round(&sys, out, cap);
        for (size_t i = 0; i < n; i++)
            printf("ASSIGN %ld %ld %d %ld\n", out[i].request_id, out[i].team_id, out[i].priority, out[i].request_time);
        print_waiting(&sys, "WAITING");
        size_t avail = ps_count_available_teams(&sys);
        printf("SUMMARY assigned=%zu pending=%zu available_teams=%zu busy_teams=%zu\n",
               n, ps_count_pending(&sys), avail, sys.n_teams - avail);
        free(out);
        if (ps_validate(&sys) != PS_OK) { ps_free(&sys); return fail(EXIT_REJECTED, "post-run validation failed", 0); }
    } else {
        long team_id = 0;
        ps_result r = ps_complete(&sys, complete_id, &team_id);
        if (r != PS_OK) {
            ps_free(&sys);
            return fail(r == PS_ERR_NOT_FOUND ? EXIT_BAD_INPUT : EXIT_REJECTED, ps_result_message(r), 0);
        }
        printf("COMPLETED %ld %ld\n", complete_id, team_id);
    }
    ps_free(&sys);
    return 0;
}
