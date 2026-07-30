-- Existing users need a username backfill before this column can become NOT NULL.
ALTER TABLE `users`
    ADD COLUMN `username` VARCHAR(30) NULL;

CREATE UNIQUE INDEX `users_username_key` ON `users`(`username`);
