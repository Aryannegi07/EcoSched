-- =====================================================================
-- EcoSched - useful queries.  Sections 1-6 are read-only and safe to run any time.
-- Run in MySQL Workbench or:  mysql -u root -p ecosched < database/queries.sql
-- Section 7 (CRUD / transaction examples) CHANGES data: run it on a copy or re-seed afterwards.
-- =====================================================================
USE ecosched;

-- =====================================================================
-- 1. REQUESTS
-- =====================================================================

-- Q1. Pending requests, oldest first (FCFS)                -> GET /api/requests/pending
SELECT request_id, user_id, item_id, location, priority, request_time, status
FROM   pickup_requests
WHERE  status = 'PENDING'
ORDER  BY request_time ASC;

-- Q2. Requests ordered by priority (what the C scheduler dispatches)
--     highest priority first, ties -> oldest first          -> GET /api/requests/priority
SELECT request_id, priority, request_time, status, location
FROM   pickup_requests
WHERE  status = 'PENDING'
ORDER  BY priority DESC, request_time ASC;

-- Q3. Same queue through the view
SELECT * FROM v_pending_priority_queue;

-- Q4. Full request details (JOIN of users, e_waste, pickup_requests, collection_teams)
SELECT * FROM v_request_details ORDER BY request_id;

-- Q5. Completed requests with who collected them and the item weight
SELECT r.request_id, u.full_name AS requested_by, e.item_name, e.weight_kg,
       t.team_name AS collected_by, r.request_time
FROM   pickup_requests r
JOIN   users   u ON u.user_id = r.user_id
JOIN   e_waste e ON e.item_id = r.item_id
JOIN   collection_teams t ON t.team_id = r.team_id
WHERE  r.status = 'COMPLETED'
ORDER  BY r.request_time DESC;

-- Q6. Request counts by status (includes statuses with 0 rows)
SELECT s.status, COUNT(r.request_id) AS total
FROM  (SELECT 'PENDING' AS status UNION ALL SELECT 'ASSIGNED' UNION ALL SELECT 'IN_PROGRESS'
       UNION ALL SELECT 'COMPLETED' UNION ALL SELECT 'CANCELLED') s
LEFT  JOIN pickup_requests r ON r.status = s.status
GROUP BY s.status;

-- Q7. Longest-waiting pending requests (spot starvation of low-priority work)
SELECT request_id, priority, request_time,
       TIMESTAMPDIFF(HOUR, request_time, NOW()) AS hours_waiting
FROM   pickup_requests
WHERE  status = 'PENDING'
ORDER  BY request_time ASC
LIMIT  5;

-- Q8. Heaviest pending pickups (needs a bigger vehicle)
SELECT r.request_id, e.item_name, e.weight_kg, r.priority
FROM   pickup_requests r
JOIN   e_waste e ON e.item_id = r.item_id
WHERE  r.status = 'PENDING'
ORDER  BY e.weight_kg DESC;

-- =====================================================================
-- 2. USERS
-- =====================================================================

-- Q9. Request history of one user (change the id)          -> RequestHistory page
SELECT r.request_id, r.status, r.priority, r.request_time, e.item_name, r.location,
       t.team_name AS assigned_team
FROM   pickup_requests r
JOIN   e_waste e ON e.item_id = r.item_id
LEFT   JOIN collection_teams t ON t.team_id = r.team_id
WHERE  r.user_id = 1
ORDER  BY r.request_time DESC;

-- Q10. Users with their number of items and requests (LEFT JOIN + GROUP BY)
SELECT u.user_id, u.full_name,
       COUNT(DISTINCT e.item_id)    AS items,
       COUNT(DISTINCT r.request_id) AS requests
FROM   users u
LEFT   JOIN e_waste         e ON e.user_id = u.user_id
LEFT   JOIN pickup_requests r ON r.user_id = u.user_id
GROUP  BY u.user_id, u.full_name
ORDER  BY u.user_id;

-- Q11. Users who never made a request (anti-join)
SELECT u.user_id, u.full_name
FROM   users u
LEFT   JOIN pickup_requests r ON r.user_id = u.user_id
WHERE  r.request_id IS NULL;

-- Q12. Items that have no pickup request yet (NOT EXISTS)
SELECT e.item_id, e.item_name, e.user_id
FROM   e_waste e
WHERE  NOT EXISTS (SELECT 1 FROM pickup_requests r WHERE r.item_id = e.item_id);

-- =====================================================================
-- 3. TEAMS
-- =====================================================================

-- Q13. Available teams                                       -> GET /api/teams/available
SELECT team_id, team_name, contact_phone, vehicle_number
FROM   collection_teams
WHERE  status = 'AVAILABLE'
ORDER  BY team_name;

-- Q14. Busy teams and the request each one is working on (via current_task)
SELECT t.team_id, t.team_name, t.current_task AS request_id,
       r.status AS request_status, r.priority, r.location
FROM   collection_teams t
JOIN   pickup_requests r ON r.request_id = t.current_task
WHERE  t.status = 'BUSY';

-- Q15. Team assignments: every request that has a team (current + past)
SELECT t.team_name, r.request_id, r.status, r.priority, e.item_name, r.location
FROM   pickup_requests r
JOIN   collection_teams t ON t.team_id = r.team_id
JOIN   e_waste e ON e.item_id = r.item_id
ORDER  BY t.team_name, r.request_id;

-- Q16. Team workload (via view): active and completed requests per team
SELECT * FROM v_team_workload ORDER BY team_id;

-- Q17. Busiest teams: completed jobs and total kg collected
SELECT t.team_name, COUNT(r.request_id) AS completed_jobs, COALESCE(SUM(e.weight_kg), 0) AS kg_collected
FROM   collection_teams t
LEFT   JOIN pickup_requests r ON r.team_id = t.team_id AND r.status = 'COMPLETED'
LEFT   JOIN e_waste e ON e.item_id = r.item_id
GROUP  BY t.team_id, t.team_name
ORDER  BY completed_jobs DESC, kg_collected DESC;

-- =====================================================================
-- 4. E-WASTE STATISTICS
-- =====================================================================

-- Q18. Totals                                                -> GET /api/admin/stats
SELECT COUNT(*) AS item_records, SUM(quantity) AS total_units, SUM(weight_kg) AS total_weight_kg
FROM   e_waste;

-- Q19. Per category                                          -> GET /api/admin/ewaste-stats
SELECT category, COUNT(*) AS item_records, SUM(quantity) AS total_units, SUM(weight_kg) AS total_weight_kg
FROM   e_waste
GROUP  BY category
ORDER  BY total_weight_kg DESC;

-- Q20. Weight actually collected (COMPLETED requests) versus still waiting
SELECT r.status, COUNT(*) AS requests, SUM(e.weight_kg) AS weight_kg
FROM   pickup_requests r
JOIN   e_waste e ON e.item_id = r.item_id
GROUP  BY r.status;

-- Q21. Hazardous-looking items (batteries / damaged) still not collected
SELECT e.item_id, e.item_name, e.category, e.item_condition, r.request_id, r.status
FROM   e_waste e
JOIN   pickup_requests r ON r.item_id = e.item_id
WHERE  (e.category = 'BATTERY' OR e.item_condition = 'DAMAGED')
  AND  r.status IN ('PENDING','ASSIGNED','IN_PROGRESS');

-- =====================================================================
-- 5. DASHBOARD NUMBERS (one row; same figures as GET /api/admin/stats)
-- =====================================================================
SELECT (SELECT COUNT(*) FROM users)                                               AS total_users,
       (SELECT COUNT(*) FROM e_waste)                                             AS total_ewaste_items,
       (SELECT COALESCE(SUM(weight_kg),0) FROM e_waste)                           AS total_ewaste_kg,
       (SELECT COUNT(*) FROM pickup_requests WHERE status = 'PENDING')            AS pending,
       (SELECT COUNT(*) FROM pickup_requests WHERE status = 'ASSIGNED')           AS assigned,
       (SELECT COUNT(*) FROM pickup_requests WHERE status = 'IN_PROGRESS')        AS in_progress,
       (SELECT COUNT(*) FROM pickup_requests WHERE status = 'COMPLETED')          AS completed,
       (SELECT COUNT(*) FROM collection_teams WHERE status = 'AVAILABLE')         AS available_teams,
       (SELECT COUNT(*) FROM collection_teams WHERE status = 'BUSY')              AS busy_teams;

-- =====================================================================
-- 6. CONSISTENCY / PERFORMANCE
-- =====================================================================

-- Q22. Must return 0 rows. Anything here is an OS<->DBMS inconsistency, e.g.
--      "pickup_requests.team_id = Team 1 while Team 1 is AVAILABLE".
SELECT * FROM v_integrity_violations;

-- Q23. A team must never hold two active requests (also enforced by uq_requests_active_team). 0 rows.
SELECT team_id, COUNT(*) AS active_requests
FROM   pickup_requests
WHERE  status IN ('ASSIGNED','IN_PROGRESS')
GROUP  BY team_id
HAVING COUNT(*) > 1;

-- Q24. Does the priority-queue query use the composite index?  (key = idx_requests_status_priority_time)
EXPLAIN
SELECT request_id, priority, request_time
FROM   pickup_requests
WHERE  status = 'PENDING'
ORDER  BY priority DESC, request_time ASC;

-- =====================================================================
-- 7. CRUD + TRANSACTION EXAMPLES  (these CHANGE data)
-- =====================================================================
-- CREATE
-- INSERT INTO users (full_name, email, phone, address)
--        VALUES ('Test User', 'test.user@example.com', '9876500099', '1 Test Road');
-- READ    (any SELECT above)
-- UPDATE
-- UPDATE collection_teams SET contact_phone = '9811100099', vehicle_number = 'UK07-ZZ-0001' WHERE team_id = 4;
-- DELETE  (RESTRICT foreign keys: refused if the row is still referenced)
-- DELETE FROM collection_teams WHERE team_id = 4;     -- ok only if the team has no requests

-- Assign a request: the exact transaction Spring runs (see also procedures.sql)
-- START TRANSACTION;
--   SELECT status FROM pickup_requests  WHERE request_id = 1 FOR UPDATE;   -- lock both rows
--   SELECT status FROM collection_teams WHERE team_id    = 3 FOR UPDATE;
--   UPDATE pickup_requests  SET team_id = 3, status = 'ASSIGNED'               WHERE request_id = 1;
--   UPDATE collection_teams SET status = 'BUSY', current_task = 1              WHERE team_id = 3;
-- COMMIT;        -- or ROLLBACK; nothing is half-applied

-- Complete a request: release the team first, then close the request
-- START TRANSACTION;
--   UPDATE collection_teams SET status = 'AVAILABLE', current_task = NULL WHERE team_id = 3;
--   UPDATE pickup_requests  SET status = 'COMPLETED'                      WHERE request_id = 1;
-- COMMIT;
