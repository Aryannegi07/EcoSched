-- Non-destructive migration for existing EcoSched installations.
USE ecosched;
SET @db = DATABASE();

SET @sql = IF(
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=@db AND table_name='users' AND column_name='password_hash'),
  'SELECT 1',
  'ALTER TABLE users ADD COLUMN password_hash VARCHAR(100) NULL'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=@db AND table_name='users' AND column_name='role'),
  'SELECT 1',
  'ALTER TABLE users ADD COLUMN role VARCHAR(10) NOT NULL DEFAULT ''USER'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=@db AND table_name='e_waste' AND column_name='image_path'),
  'SELECT 1',
  'ALTER TABLE e_waste ADD COLUMN image_path VARCHAR(255) NULL'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- Set a BCrypt hash supplied by the owner for the one dedicated admin account:
-- UPDATE users SET role='ADMIN', password_hash='BCRYPT_HASH' WHERE email='ADMIN_EMAIL';
-- After migrating, make password_hash required once every legacy account has been reset:
-- ALTER TABLE users MODIFY password_hash VARCHAR(100) NOT NULL;
