-- =====================================================================
-- EcoSched - Smart E-Waste Management and Collection Scheduling System
-- Team SysCore | MySQL 8.0.16+ schema (InnoDB, utf8mb4)
-- (CHECK constraints are only enforced from MySQL 8.0.16 onwards.)
--
-- WARNING: this script DROPS and re-creates all tables (resets data).
-- Run:  mysql -u root -p < database/schema.sql
--
-- Design summary (3NF):
--   users 1---* e_waste 1---* pickup_requests *---1 collection_teams
--   collection_teams.current_task points back to the request the team is
--   working on (so "who is doing what" is stored on BOTH sides and the
--   database itself keeps the two sides consistent).
-- =====================================================================

CREATE DATABASE IF NOT EXISTS ecosched
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE ecosched;

-- Drop everything. pickup_requests and collection_teams reference each
-- other (circular foreign keys), so checks are switched off while dropping.
SET FOREIGN_KEY_CHECKS = 0;
DROP VIEW    IF EXISTS v_integrity_violations;
DROP VIEW    IF EXISTS v_team_workload;
DROP VIEW    IF EXISTS v_request_details;
DROP VIEW    IF EXISTS v_pending_priority_queue;
DROP TRIGGER IF EXISTS trg_teams_current_task_check;
DROP TRIGGER IF EXISTS trg_requests_release_check;
DROP PROCEDURE IF EXISTS sp_assign_request;
DROP PROCEDURE IF EXISTS sp_complete_request;
DROP TABLE   IF EXISTS pickup_requests;
DROP TABLE   IF EXISTS e_waste;
DROP TABLE   IF EXISTS collection_teams;
DROP TABLE   IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- 1. users : people who request e-waste pickups
-- ---------------------------------------------------------------------
CREATE TABLE users (
    user_id     BIGINT        NOT NULL AUTO_INCREMENT,
    full_name   VARCHAR(100)  NOT NULL,
    email       VARCHAR(150)  NOT NULL,
    phone       VARCHAR(15)   NOT NULL,
    address     VARCHAR(255)  NOT NULL,
    password_hash VARCHAR(100) NULL,
    role        VARCHAR(10)   NOT NULL DEFAULT 'USER',
    created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_users        PRIMARY KEY (user_id),
    CONSTRAINT uq_users_email  UNIQUE (email),
    CONSTRAINT chk_users_email CHECK (email LIKE '%_@_%._%'),
    CONSTRAINT chk_users_phone CHECK (phone REGEXP '^[+]?[0-9]{10,13}$'),
    CONSTRAINT chk_users_name  CHECK (CHAR_LENGTH(TRIM(full_name)) > 0)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 2. e_waste : items a user wants to dispose of
-- ---------------------------------------------------------------------
CREATE TABLE e_waste (
    item_id         BIGINT         NOT NULL AUTO_INCREMENT,
    user_id         BIGINT         NOT NULL,
    item_name       VARCHAR(100)   NOT NULL,
    category        VARCHAR(30)    NOT NULL,
    item_condition  VARCHAR(20)    NOT NULL DEFAULT 'NON_WORKING',
    quantity        INT            NOT NULL DEFAULT 1,
    weight_kg       DECIMAL(8,2)   NOT NULL,
    description     VARCHAR(255)   NULL,
    image_path      VARCHAR(255)   NULL,
    created_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_e_waste PRIMARY KEY (item_id),
    -- (item_id, user_id) is unique so pickup_requests can use it as a
    -- composite foreign key: a request can only point to an item that
    -- belongs to the SAME user who made the request.
    CONSTRAINT uq_e_waste_item_user UNIQUE (item_id, user_id),
    CONSTRAINT fk_e_waste_user FOREIGN KEY (user_id)
        REFERENCES users (user_id) ON DELETE RESTRICT,
    CONSTRAINT chk_e_waste_category CHECK (category IN
        ('LAPTOP','MOBILE','TABLET','BATTERY','TV_MONITOR','APPLIANCE','ACCESSORY','OTHER')),
    CONSTRAINT chk_e_waste_condition CHECK (item_condition IN
        ('WORKING','DAMAGED','NON_WORKING')),
    CONSTRAINT chk_e_waste_quantity CHECK (quantity > 0),
    CONSTRAINT chk_e_waste_weight   CHECK (weight_kg > 0),
    INDEX idx_e_waste_user     (user_id),
    INDEX idx_e_waste_category (category)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 3. collection_teams : crews that physically collect the e-waste
--    current_task = the request the team is working on right now.
--    Rule enforced by CHECK:  BUSY <=> current_task IS NOT NULL
--    The foreign key to pickup_requests is added after that table exists.
-- ---------------------------------------------------------------------
CREATE TABLE collection_teams (
    team_id         BIGINT        NOT NULL AUTO_INCREMENT,
    team_name       VARCHAR(100)  NOT NULL,
    contact_phone   VARCHAR(15)   NOT NULL,
    vehicle_number  VARCHAR(20)   NULL,
    status          VARCHAR(20)   NOT NULL DEFAULT 'AVAILABLE',
    current_task    BIGINT        NULL,
    created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_collection_teams PRIMARY KEY (team_id),
    CONSTRAINT uq_teams_name       UNIQUE (team_name),
    -- one request can be the current task of at most one team (NULLs are allowed many times)
    CONSTRAINT uq_teams_current_task UNIQUE (current_task),
    CONSTRAINT chk_teams_status    CHECK (status IN ('AVAILABLE','BUSY')),
    CONSTRAINT chk_teams_phone     CHECK (contact_phone REGEXP '^[+]?[0-9]{10,13}$'),
    CONSTRAINT chk_teams_busy_task CHECK (
        (status = 'AVAILABLE' AND current_task IS NULL) OR
        (status = 'BUSY'      AND current_task IS NOT NULL)),
    INDEX idx_teams_status (status)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 4. pickup_requests : a user's request to collect one e-waste item
--    team_id stays NULL until the scheduler assigns a team.
--    Priority: higher number = higher priority (1 to 10).
-- ---------------------------------------------------------------------
CREATE TABLE pickup_requests (
    request_id    BIGINT        NOT NULL AUTO_INCREMENT,
    user_id       BIGINT        NOT NULL,
    item_id       BIGINT        NOT NULL,
    team_id       BIGINT        NULL,
    location      VARCHAR(255)  NOT NULL,
    priority      INT           NOT NULL DEFAULT 1,
    request_time  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status        VARCHAR(20)   NOT NULL DEFAULT 'PENDING',

    -- Generated column: the team that is occupied by this request right now
    -- (NULL once the request is finished). The UNIQUE index below therefore
    -- guarantees "a team never has two active requests".
    active_team_id BIGINT AS
        (CASE WHEN status IN ('ASSIGNED','IN_PROGRESS') THEN team_id END) STORED,

    CONSTRAINT pk_pickup_requests PRIMARY KEY (request_id),
    -- target of the composite foreign key from collection_teams
    CONSTRAINT uq_requests_team_request UNIQUE (team_id, request_id),
    CONSTRAINT uq_requests_active_team  UNIQUE (active_team_id),

    CONSTRAINT fk_requests_user FOREIGN KEY (user_id)
        REFERENCES users (user_id) ON DELETE RESTRICT,
    CONSTRAINT fk_requests_item_user FOREIGN KEY (item_id, user_id)
        REFERENCES e_waste (item_id, user_id) ON DELETE RESTRICT,
    CONSTRAINT fk_requests_team FOREIGN KEY (team_id)
        REFERENCES collection_teams (team_id) ON DELETE RESTRICT,

    CONSTRAINT chk_requests_priority CHECK (priority BETWEEN 1 AND 10),
    CONSTRAINT chk_requests_status   CHECK (status IN
        ('PENDING','ASSIGNED','IN_PROGRESS','COMPLETED','CANCELLED')),
    -- A team must be present once work is assigned / started / finished.
    CONSTRAINT chk_requests_team_when_active CHECK
        (status NOT IN ('ASSIGNED','IN_PROGRESS','COMPLETED') OR team_id IS NOT NULL),
    -- A request that is still waiting cannot already have a team.
    CONSTRAINT chk_requests_no_team_when_pending CHECK
        (status <> 'PENDING' OR team_id IS NULL),

    INDEX idx_requests_user_time  (user_id, request_time),
    INDEX idx_requests_item_user  (item_id, user_id),
    INDEX idx_requests_team_status (team_id, status),
    -- Serves the scheduler query: WHERE status='PENDING'
    --                             ORDER BY priority DESC, request_time ASC
    INDEX idx_requests_status_priority_time (status, priority DESC, request_time ASC)
) ENGINE=InnoDB;

-- Now that both tables exist: team -> the request it is working on.
-- Composite key (team_id, current_task) means the request must ALREADY carry
-- this very team_id, so a team can never point at somebody else's request.
-- (If current_task is NULL the key is not checked, which is what we want.)
ALTER TABLE collection_teams
    ADD CONSTRAINT fk_teams_current_task FOREIGN KEY (team_id, current_task)
        REFERENCES pickup_requests (team_id, request_id) ON DELETE RESTRICT;

-- ---------------------------------------------------------------------
-- Triggers: the two rules a foreign key cannot express.
-- ---------------------------------------------------------------------
DELIMITER $$

-- A team may only hold a request that is ASSIGNED or IN_PROGRESS.
CREATE TRIGGER trg_teams_current_task_check
BEFORE UPDATE ON collection_teams
FOR EACH ROW
BEGIN
    IF NEW.current_task IS NOT NULL
       AND (SELECT status FROM pickup_requests WHERE request_id = NEW.current_task)
           NOT IN ('ASSIGNED','IN_PROGRESS') THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'current_task must be an ASSIGNED or IN_PROGRESS request';
    END IF;
END$$

-- A request cannot be finished while a team still lists it as its task:
-- the team must be released first (this is the order the transaction uses).
CREATE TRIGGER trg_requests_release_check
BEFORE UPDATE ON pickup_requests
FOR EACH ROW
BEGIN
    IF NEW.status IN ('COMPLETED','CANCELLED') AND OLD.status IN ('ASSIGNED','IN_PROGRESS')
       AND EXISTS (SELECT 1 FROM collection_teams WHERE current_task = NEW.request_id) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'release the team (current_task) before finishing the request';
    END IF;
END$$

DELIMITER ;

-- ---------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------

-- The ready queue the OS scheduler reads (highest priority first, FCFS on ties).
CREATE VIEW v_pending_priority_queue AS
SELECT request_id, user_id, item_id, location, priority, request_time, status
FROM   pickup_requests
WHERE  status = 'PENDING'
ORDER  BY priority DESC, request_time ASC;

-- One readable row per request (4-table JOIN).
CREATE VIEW v_request_details AS
SELECT r.request_id, r.status, r.priority, r.request_time, r.location,
       u.user_id, u.full_name AS requested_by, u.phone AS user_phone,
       e.item_id, e.item_name, e.category, e.quantity, e.weight_kg,
       t.team_id, t.team_name AS assigned_team
FROM   pickup_requests r
JOIN   users   u ON u.user_id = r.user_id
JOIN   e_waste e ON e.item_id = r.item_id
LEFT   JOIN collection_teams t ON t.team_id = r.team_id;

-- Per-team workload.
CREATE VIEW v_team_workload AS
SELECT t.team_id, t.team_name, t.status, t.current_task,
       COALESCE(SUM(r.status IN ('ASSIGNED','IN_PROGRESS')), 0) AS active_requests,
       COALESCE(SUM(r.status = 'COMPLETED'), 0)                  AS completed_requests,
       COUNT(r.request_id)                                       AS total_requests
FROM   collection_teams t
LEFT   JOIN pickup_requests r ON r.team_id = t.team_id
GROUP  BY t.team_id, t.team_name, t.status, t.current_task;

-- Every row here is a consistency bug. A healthy database returns 0 rows.
CREATE VIEW v_integrity_violations AS
-- request is active with a team, but that team is not working on it
SELECT 'ACTIVE_REQUEST_TEAM_NOT_BUSY_ON_IT' AS problem, r.request_id, r.team_id
FROM   pickup_requests r
JOIN   collection_teams t ON t.team_id = r.team_id
WHERE  r.status IN ('ASSIGNED','IN_PROGRESS')
  AND  (t.status <> 'BUSY' OR t.current_task IS NULL OR t.current_task <> r.request_id)
UNION ALL
-- team is BUSY on a request that is no longer active
SELECT 'BUSY_TEAM_REQUEST_NOT_ACTIVE', t.current_task, t.team_id
FROM   collection_teams t
LEFT   JOIN pickup_requests r ON r.request_id = t.current_task
WHERE  t.status = 'BUSY'
  AND  (r.request_id IS NULL OR r.status NOT IN ('ASSIGNED','IN_PROGRESS') OR r.team_id <> t.team_id);
