-- =====================================================================
-- EcoSched scheduler checks. Run in MySQL Workbench / mysql after using the scheduler.
-- Every "should be 0 rows" query is a violated invariant if it returns anything.
-- =====================================================================
USE ecosched;

-- 0. The one-stop check: all OS<->DBMS inconsistencies (should be 0 rows)
SELECT * FROM v_integrity_violations;

-- 1. No team may hold two active requests (should be 0 rows)
SELECT team_id, COUNT(*) AS active_requests
FROM   pickup_requests
WHERE  status IN ('ASSIGNED','IN_PROGRESS')
GROUP  BY team_id
HAVING COUNT(*) > 1;

-- 2. A BUSY team must have an active request (should be 0 rows)
SELECT t.team_id, t.team_name
FROM   collection_teams t
WHERE  t.status = 'BUSY'
  AND  NOT EXISTS (SELECT 1 FROM pickup_requests r
                   WHERE r.team_id = t.team_id AND r.status IN ('ASSIGNED','IN_PROGRESS'));

-- 3. An AVAILABLE team must not have an active request (should be 0 rows)
SELECT t.team_id, t.team_name
FROM   collection_teams t
WHERE  t.status = 'AVAILABLE'
  AND  EXISTS (SELECT 1 FROM pickup_requests r
               WHERE r.team_id = t.team_id AND r.status IN ('ASSIGNED','IN_PROGRESS'));

-- 4. What each team is doing right now
SELECT t.team_id, t.team_name, t.status AS team_status, t.current_task,
       r.request_id AS active_request, r.priority, r.status AS request_status
FROM   collection_teams t
LEFT   JOIN pickup_requests r
       ON r.team_id = t.team_id AND r.status IN ('ASSIGNED','IN_PROGRESS')
ORDER  BY t.team_id;

-- 5. The ready queue in the order the C scheduler dispatches it
SELECT request_id, priority, request_time FROM v_pending_priority_queue;
