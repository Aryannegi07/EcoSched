/* Unit tests for the EcoSched priority scheduler (no database needed). Run: make test */
#include "priority_scheduler.h"

#include <stdio.h>

static int passed = 0, failed = 0;
#define CHECK(cond, name) do { if (cond) { passed++; printf("  PASS  %s\n", name); } \
                               else { failed++; printf("  FAIL  %s  (line %d)\n", name, __LINE__); } } while (0)

static void add_req(ps_system *s, long id, int prio, long t) { ps_add_request(s, id, prio, t, PS_PENDING, PS_NO_TEAM); }

static void test_example_3_5_2_4(void) {
    printf("Example: R1=3 R2=5 R3=2 R4=4, one team\n");
    ps_system s; ps_init(&s);
    add_req(&s, 1, 3, 100); add_req(&s, 2, 5, 101); add_req(&s, 3, 2, 102); add_req(&s, 4, 4, 103);
    ps_add_team(&s, 1, PS_TEAM_AVAILABLE);
    ps_finalize(&s);

    ps_assignment a[4];
    CHECK(ps_select_next(&s)->request_id == 2, "R2 (priority 5) is selected first");
    CHECK(ps_schedule_round(&s, a, 4) == 1 && a[0].request_id == 2 && a[0].team_id == 1, "one team -> exactly R2 assigned");
    CHECK(ps_find_team(&s, 1)->availability == PS_TEAM_BUSY, "team becomes BUSY");
    CHECK(ps_find_team(&s, 1)->current_task == 2, "team current_task = R2");
    CHECK(ps_find_request(&s, 2)->status == PS_ASSIGNED, "R2 becomes ASSIGNED");

    CHECK(ps_schedule_round(&s, a, 4) == 0, "team busy -> next round assigns nothing");
    long tid = 0;
    CHECK(ps_complete(&s, 2, &tid) == PS_OK && tid == 1, "complete R2");
    CHECK(ps_find_request(&s, 2)->status == PS_COMPLETED, "R2 becomes COMPLETED");
    CHECK(ps_find_team(&s, 1)->availability == PS_TEAM_AVAILABLE && ps_find_team(&s, 1)->current_task == PS_NO_TASK,
          "team AVAILABLE and current_task cleared");

    CHECK(ps_schedule_round(&s, a, 4) == 1 && a[0].request_id == 4, "next round selects R4 (priority 4)");
    ps_complete(&s, 4, NULL);
    CHECK(ps_schedule_round(&s, a, 4) == 1 && a[0].request_id == 1, "then R1 (priority 3)");
    ps_complete(&s, 1, NULL);
    CHECK(ps_schedule_round(&s, a, 4) == 1 && a[0].request_id == 3, "then R3 (priority 2): order R2,R4,R1,R3");
    CHECK(ps_validate(&s) == PS_OK, "state valid");
    ps_free(&s);
}

static void test_equal_priority(void) {
    printf("Equal priorities: earlier request_time first\n");
    ps_system s; ps_init(&s);
    add_req(&s, 10, 5, 300); add_req(&s, 11, 5, 100); add_req(&s, 12, 5, 200);
    ps_add_team(&s, 1, PS_TEAM_AVAILABLE); ps_finalize(&s);
    CHECK(ps_select_next(&s)->request_id == 11, "earliest request_time wins the tie");
    const ps_request *q[3];
    CHECK(ps_pending_sorted(&s, q, 3) == 3 && q[0]->request_id == 11 && q[1]->request_id == 12 && q[2]->request_id == 10,
          "order is 11, 12, 10");
    ps_free(&s);
    ps_init(&s);
    add_req(&s, 21, 4, 500); add_req(&s, 20, 4, 500);
    CHECK(ps_select_next(&s)->request_id == 20, "same time too: lower request_id (deterministic)");
    ps_free(&s);
}

static void test_all_teams_busy(void) {
    printf("All teams busy\n");
    ps_system s; ps_init(&s);
    ps_add_team(&s, 1, PS_TEAM_BUSY); ps_add_team(&s, 2, PS_TEAM_BUSY);
    ps_add_request(&s, 1, 9, 10, PS_IN_PROGRESS, 1);
    ps_add_request(&s, 2, 3, 11, PS_ASSIGNED, 2);
    add_req(&s, 3, 10, 12);
    CHECK(ps_finalize(&s) == PS_OK, "finalize links active requests");
    CHECK(ps_find_available_team(&s) == NULL, "no available team");
    CHECK(ps_schedule_round(&s, NULL, 0) == 0, "nothing assigned");
    CHECK(ps_find_request(&s, 3)->status == PS_PENDING, "request stays PENDING");
    ps_request *r = ps_find_request(&s, 3);
    CHECK(ps_assign(&s, r, ps_find_team(&s, 1)) == PS_ERR_TEAM_BUSY, "direct assign to busy team refused");
    ps_free(&s);
    ps_init(&s);
    ps_add_team(&s, 1, PS_TEAM_BUSY);     /* manually busy, no task */
    add_req(&s, 1, 5, 1);
    ps_finalize(&s);
    CHECK(ps_schedule_round(&s, NULL, 0) == 0, "team flagged BUSY (no task) is not used");
    ps_free(&s);
}

static void test_non_preemptive(void) {
    printf("Non-preemptive: higher-priority arrival does not interrupt\n");
    ps_system s; ps_init(&s);
    add_req(&s, 1, 2, 10);
    ps_add_team(&s, 1, PS_TEAM_AVAILABLE); ps_finalize(&s);
    ps_schedule_round(&s, NULL, 0);
    CHECK(ps_find_request(&s, 1)->status == PS_ASSIGNED, "low-priority R1 running");
    add_req(&s, 2, 10, 20);               /* urgent request arrives later */
    CHECK(ps_schedule_round(&s, NULL, 0) == 0, "no new assignment while the team is busy");
    CHECK(ps_find_request(&s, 1)->status == PS_ASSIGNED && ps_find_request(&s, 1)->team_id == 1, "R1 keeps its team");
    CHECK(ps_find_request(&s, 2)->status == PS_PENDING, "urgent R2 waits");
    ps_complete(&s, 1, NULL);
    ps_assignment a[1];
    CHECK(ps_schedule_round(&s, a, 1) == 1 && a[0].request_id == 2, "R2 runs after R1 completes");
    ps_free(&s);
}

static void test_10_requests_2_teams(void) {
    printf("10 requests + 2 teams\n");
    ps_system s; ps_init(&s);
    int prio[10] = {3, 5, 2, 4, 5, 1, 9, 7, 7, 6};
    for (int i = 0; i < 10; i++) add_req(&s, i + 1, prio[i], 1000 + i * 10);
    ps_add_team(&s, 1, PS_TEAM_AVAILABLE); ps_add_team(&s, 2, PS_TEAM_AVAILABLE); ps_finalize(&s);
    ps_assignment a[10];
    size_t n = ps_schedule_round(&s, a, 10);
    CHECK(n == 2, "only 2 requests assigned");
    CHECK(a[0].request_id == 7 && a[1].request_id == 8, "R7(9) then R8(7, earlier than R9) selected");
    CHECK(a[0].team_id != a[1].team_id, "two different teams");
    CHECK(ps_count_pending(&s) == 8, "8 requests stay PENDING");
    CHECK(ps_count_available_teams(&s) == 0, "no team left");
    CHECK(ps_validate(&s) == PS_OK, "no team holds two active requests");

    /* drain everything, checking the invariant at every step and the overall order */
    long expected[10] = {7, 8, 9, 10, 2, 5, 4, 1, 3, 6};
    int idx = 2, ok = 1, valid = 1;
    ps_complete(&s, 7, NULL);
    for (int step = 0; step < 20 && idx < 10; step++) {
        ps_assignment b[2];
        size_t m = ps_schedule_round(&s, b, 2);
        for (size_t k = 0; k < m; k++) { if (b[k].request_id != expected[idx]) ok = 0; idx++; }
        if (ps_validate(&s) != PS_OK) valid = 0;
        /* complete whatever is active, oldest id first */
        for (long id = 1; id <= 10; id++) {
            ps_request *r = ps_find_request(&s, id);
            if (r->status == PS_ASSIGNED) { ps_complete(&s, id, NULL); break; }
        }
    }
    CHECK(idx == 10 && ok, "full dispatch order follows priority, then request_time");
    CHECK(valid, "invariant held in every round");
    ps_free(&s);
}

static void test_validation(void) {
    printf("Input validation / consistency\n");
    ps_system s; ps_init(&s);
    ps_add_team(&s, 1, PS_TEAM_BUSY);
    ps_add_request(&s, 1, 5, 1, PS_ASSIGNED, 1);
    ps_add_request(&s, 2, 5, 2, PS_IN_PROGRESS, 1);
    CHECK(ps_finalize(&s) == PS_ERR_TEAM_CONFLICT, "two active requests on one team detected");
    ps_free(&s);
    ps_init(&s);
    CHECK(ps_add_request(&s, 1, 11, 1, PS_PENDING, PS_NO_TEAM) == PS_ERR_BAD_INPUT, "priority 11 rejected");
    add_req(&s, 1, 5, 1);
    CHECK(ps_add_request(&s, 1, 5, 1, PS_PENDING, PS_NO_TEAM) == PS_ERR_DUPLICATE_ID, "duplicate request id rejected");
    CHECK(ps_complete(&s, 1, NULL) == PS_ERR_REQUEST_NOT_ACTIVE, "cannot complete a PENDING request");
    CHECK(ps_complete(&s, 99, NULL) == PS_ERR_NOT_FOUND, "unknown request id");
    ps_free(&s);
}

int main(void) {
    test_example_3_5_2_4();
    test_equal_priority();
    test_all_teams_busy();
    test_non_preemptive();
    test_10_requests_2_teams();
    test_validation();
    printf("\nRESULT: %d passed, %d failed\n", passed, failed);
    return failed ? 1 : 0;
}
