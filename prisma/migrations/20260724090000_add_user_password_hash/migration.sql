-- Existing accounts cannot be assigned a password safely. They must complete a
-- password-reset flow before using password login, so retain a nullable hash.
ALTER TABLE `users` ADD COLUMN `password_hash` VARCHAR(60) NULL;
