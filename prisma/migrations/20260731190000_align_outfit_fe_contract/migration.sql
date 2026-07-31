ALTER TABLE `outfit_generation_jobs`
    MODIFY `status` ENUM('QUEUED', 'PROCESSING', 'QC_PENDING', 'COMPLETED', 'FAILED', 'EXPIRED') NOT NULL DEFAULT 'QUEUED',
    ADD COLUMN `situation` VARCHAR(30) NULL,
    ADD COLUMN `selected_date` DATE NULL,
    ADD COLUMN `weather` JSON NULL,
    ADD COLUMN `progress` INTEGER NOT NULL DEFAULT 5,
    ADD COLUMN `expires_at` DATETIME(3) NULL;

UPDATE `outfit_generation_jobs`
SET `expires_at` = DATE_ADD(`created_at`, INTERVAL 10 MINUTE)
WHERE `expires_at` IS NULL;

ALTER TABLE `outfit_generation_jobs`
    MODIFY `expires_at` DATETIME(3) NOT NULL;

ALTER TABLE `saved_outfits`
    ADD COLUMN `tags` JSON NULL,
    ADD COLUMN `memo` VARCHAR(500) NULL,
    ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `deleted_at` DATETIME(3) NULL;

UPDATE `saved_outfits` SET `tags` = JSON_ARRAY() WHERE `tags` IS NULL;

ALTER TABLE `saved_outfits` MODIFY `tags` JSON NOT NULL;

CREATE INDEX `saved_outfits_user_id_deleted_at_idx` ON `saved_outfits`(`user_id`, `deleted_at`);

CREATE TABLE `outfit_revisions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `source_outfit_result_id` INTEGER NOT NULL,
    `replace_item_id` INTEGER NOT NULL,
    `new_item_id` INTEGER NOT NULL,
    `generation_job_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `outfit_revisions_generation_job_id_key`(`generation_job_id`),
    INDEX `outfit_revisions_user_id_created_at_idx`(`user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `outfit_revisions` ADD CONSTRAINT `outfit_revisions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `outfit_revisions` ADD CONSTRAINT `outfit_revisions_source_outfit_result_id_fkey` FOREIGN KEY (`source_outfit_result_id`) REFERENCES `outfit_results`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `outfit_revisions` ADD CONSTRAINT `outfit_revisions_generation_job_id_fkey` FOREIGN KEY (`generation_job_id`) REFERENCES `outfit_generation_jobs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
