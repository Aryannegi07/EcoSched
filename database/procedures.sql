-- =====================================================================
-- EcoSched stored procedures: the SAME transactions Spring Boot runs,
-- written in SQL so you can demonstrate / test them in MySQL Workbench.
-- Spring does not call these; it uses @Transactional (SchedulerService).
-- Run AFTER schema.sql:  mysql -u root -p ecosched < database/procedures.sql
-- =====================================================================
USE ecosched;

DROP PROCEDURE IF EXISTS sp_assign_request;
DROP PROCEDURE IF EXISTS sp_complete_request;

DELIMITER $$

-- Assign a PENDING request to an AVAILABLE team - all four changes or none:
--   1. request.team_id = team   2. request.status = ASSIGNED
--   3. team.status = BUSY       4. team.current_task = request
CREATE PROCEDURE sp_assign_request(IN p_request_id BIGINT, IN p_team_id BIGINT)
BEGIN
    DECLARE v_req_status  VARCHAR(20);
    DECLARE v_team_status VARCHAR(20);

    -- any error: undo everything, then re-raise it to the caller
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    -- lock both rows so nobody else can change them while we decide
    SELECT status INTO v_req_status  FROM pickup_requests  WHERE request_id = p_request_id FOR UPDATE;
    SELECT status INTO v_team_status FROM collection_teams WHERE team_id    = p_team_id    FOR UPDATE;

    IF v_req_status IS NULL OR v_team_status IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'request or team not found';
    END IF;
    IF v_req_status <> 'PENDING' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'request is not PENDING';
    END IF;
    IF v_team_status <> 'AVAILABLE' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'team is not AVAILABLE';
    END IF;

    UPDATE pickup_requests  SET team_id = p_team_id, status = 'ASSIGNED' WHERE request_id = p_request_id;
    UPDATE collection_teams SET status = 'BUSY', current_task = p_request_id WHERE team_id = p_team_id;

    COMMIT;
END$$

-- Finish an ASSIGNED / IN_PROGRESS request: release the team FIRST, then close the request.
CREATE PROCEDURE sp_complete_request(IN p_request_id BIGINT)
BEGIN
    DECLARE v_req_status VARCHAR(20);
    DECLARE v_team_id    BIGINT;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    SELECT status, team_id INTO v_req_status, v_team_id
    FROM   pickup_requests WHERE request_id = p_request_id FOR UPDATE;

    IF v_req_status IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'request not found';
    END IF;
    IF v_req_status NOT IN ('ASSIGNED','IN_PROGRESS') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'request is not ASSIGNED or IN_PROGRESS';
    END IF;

    UPDATE collection_teams SET status = 'AVAILABLE', current_task = NULL WHERE team_id = v_team_id;
    UPDATE pickup_requests  SET status = 'COMPLETED' WHERE request_id = p_request_id;  -- keeps team_id as history

    COMMIT;
END$$

DELIMITER ;

-- Example:
--   CALL sp_assign_request(1, 3);   -- request 1 -> team 3
--   CALL sp_complete_request(1);
