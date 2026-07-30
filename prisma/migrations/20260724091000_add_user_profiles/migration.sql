ALTER TABLE `users` ADD COLUMN `style_tags` JSON NULL;

CREATE TABLE `body_profiles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `height_cm` INTEGER NULL,
    `weight_kg` DECIMAL(5,2) NULL,
    `body_type` VARCHAR(60) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `body_profiles_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `body_profiles`
    ADD CONSTRAINT `body_profiles_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- body_profile_id was previously an unconstrained optional input. Existing
-- references cannot be valid before body_profiles exists, so discard them.
UPDATE `outfit_generation_jobs` SET `body_profile_id` = NULL WHERE `body_profile_id` IS NOT NULL;

ALTER TABLE `outfit_generation_jobs`
    ADD CONSTRAINT `outfit_generation_jobs_body_profile_id_fkey`
    FOREIGN KEY (`body_profile_id`) REFERENCES `body_profiles`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
