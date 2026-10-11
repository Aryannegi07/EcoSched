-- =====================================================================
-- EcoSched sample data (fake people, fake phone numbers)
-- Run AFTER schema.sql:  mysql -u root -p ecosched < database/seed.sql
-- =====================================================================
USE ecosched;

INSERT INTO users (user_id, full_name, email, phone, address, created_at) VALUES
 (1, 'Riya Sharma', 'riya.sharma@example.com', '9876500001', '12 Rajpur Road, Dehradun',         '2026-09-20 10:00:00'),
 (2, 'Karan Mehta', 'karan.mehta@example.com', '9876500002', '45 Clock Tower Lane, Dehradun',   '2026-09-21 11:30:00'),
 (3, 'Neha Rawat',  'neha.rawat@example.com',  '9876500003', '7 Prem Nagar, Dehradun',          '2026-09-22 09:15:00'),
 (4, 'Aman Bisht',  'aman.bisht@example.com',  '9876500004', '88 Sahastradhara Road, Dehradun', '2026-09-23 16:45:00'),
 (5, 'Pooja Thapa', 'pooja.thapa@example.com', '9876500005', '3 ISBT Colony, Dehradun',         '2026-09-24 12:00:00');

INSERT INTO e_waste (item_id, user_id, item_name, category, item_condition, quantity, weight_kg, description, created_at) VALUES
 (1, 1, 'Dell Latitude Laptop',     'LAPTOP',     'NON_WORKING', 1,  2.10, 'Motherboard dead, battery swollen', '2026-09-25 08:00:00'),
 (2, 1, 'Old Android Phones',       'MOBILE',     'NON_WORKING', 3,  0.60, 'Three phones with cracked screens', '2026-09-25 08:05:00'),
 (3, 2, 'CRT Television',           'TV_MONITOR', 'NON_WORKING', 1, 14.50, '21 inch CRT TV',                    '2026-09-26 09:00:00'),
 (4, 2, 'UPS Lead-Acid Battery',    'BATTERY',    'DAMAGED',     1,  9.80, 'Leaking battery, handle with care', '2026-09-26 09:10:00'),
 (5, 3, 'Microwave Oven',           'APPLIANCE',  'NON_WORKING', 1, 11.20, NULL,                                '2026-09-27 10:20:00'),
 (6, 4, 'Tablet',                   'TABLET',     'DAMAGED',     1,  0.50, 'Screen broken',                     '2026-09-27 14:00:00'),
 (7, 4, 'Charger and Cable Bundle', 'ACCESSORY',  'WORKING',    10,  1.50, 'Assorted chargers',                 '2026-09-28 15:30:00'),
 (8, 5, 'Inkjet Printer',           'APPLIANCE',  'NON_WORKING', 1,  6.30, 'Paper feed broken',                 '2026-09-29 11:00:00');

-- Teams are inserted AVAILABLE. Teams 1 and 2 are switched to BUSY further below,
-- after the requests they are working on exist (collection_teams.current_task
-- has a foreign key to pickup_requests).
INSERT INTO collection_teams (team_id, team_name, contact_phone, vehicle_number, status, created_at) VALUES
 (1, 'Green Squad Alpha', '9811100001', 'UK07-AB-1001', 'AVAILABLE', '2026-09-01 09:00:00'),
 (2, 'Green Squad Beta',  '9811100002', 'UK07-AB-1002', 'AVAILABLE', '2026-09-01 09:00:00'),
 (3, 'Recycle Rangers',   '9811100003', 'UK07-CD-2001', 'AVAILABLE', '2026-09-02 09:00:00'),
 (4, 'EcoCrew North',     '9811100004', NULL,           'AVAILABLE', '2026-09-03 09:00:00');

INSERT INTO pickup_requests (request_id, user_id, item_id, team_id, location, priority, request_time, status) VALUES
 (1, 1, 1, NULL, '12 Rajpur Road, Dehradun',         9, '2026-10-01 09:00:00', 'PENDING'),
 (2, 2, 3, NULL, '45 Clock Tower Lane, Dehradun',    5, '2026-10-01 09:30:00', 'PENDING'),
 (3, 2, 4, NULL, '45 Clock Tower Lane, Dehradun',    9, '2026-10-01 10:15:00', 'PENDING'),
 (4, 3, 5, 1,    '7 Prem Nagar, Dehradun',           4, '2026-09-30 08:00:00', 'IN_PROGRESS'),
 (5, 4, 6, 2,    '88 Sahastradhara Road, Dehradun',  6, '2026-09-30 12:00:00', 'ASSIGNED'),
 (6, 1, 2, 3,    '12 Rajpur Road, Dehradun',         3, '2026-09-28 10:00:00', 'COMPLETED'),
 (7, 4, 7, NULL, '88 Sahastradhara Road, Dehradun',  2, '2026-09-29 17:00:00', 'CANCELLED'),
 (8, 5, 8, NULL, '3 ISBT Colony, Dehradun',          7, '2026-10-01 11:00:00', 'PENDING');

-- Team 1 is working on request 4 (IN_PROGRESS), team 2 on request 5 (ASSIGNED).
-- Teams 3 and 4 stay AVAILABLE, so one scheduler run will assign two requests.
UPDATE collection_teams SET status = 'BUSY', current_task = 4 WHERE team_id = 1;
UPDATE collection_teams SET status = 'BUSY', current_task = 5 WHERE team_id = 2;

-- Sanity check: must return 0 rows.
SELECT * FROM v_integrity_violations;
