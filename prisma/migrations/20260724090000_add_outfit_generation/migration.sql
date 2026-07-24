CREATE TABLE `outfit_generation_jobs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `status` ENUM('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'QUEUED',
    `body_profile_id` INTEGER NULL,
    `closet_item_ids` JSON NOT NULL,
    `style_tag_ids` JSON NOT NULL,
    `failure_code` VARCHAR(80) NULL,
    `failure_reason` VARCHAR(500) NULL,
    `started_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `outfit_generation_jobs_user_id_status_created_at_idx`(`user_id`, `status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `outfit_results` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `generation_job_id` INTEGER NOT NULL,
    `generated_image_url` VARCHAR(1000) NOT NULL,
    `provider` VARCHAR(80) NOT NULL,
    `fallback_used` BOOLEAN NOT NULL DEFAULT false,
    `recommended_closet_item_ids` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `outfit_results_generation_job_id_key`(`generation_job_id`),
    INDEX `outfit_results_user_id_created_at_idx`(`user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `saved_outfits` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `outfit_result_id` INTEGER NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `saved_outfits_user_id_outfit_result_id_key`(`user_id`, `outfit_result_id`),
    INDEX `saved_outfits_user_id_created_at_idx`(`user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `outfit_generation_jobs` ADD CONSTRAINT `outfit_generation_jobs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `outfit_results` ADD CONSTRAINT `outfit_results_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `outfit_results` ADD CONSTRAINT `outfit_results_generation_job_id_fkey` FOREIGN KEY (`generation_job_id`) REFERENCES `outfit_generation_jobs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `saved_outfits` ADD CONSTRAINT `saved_outfits_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `saved_outfits` ADD CONSTRAINT `saved_outfits_outfit_result_id_fkey` FOREIGN KEY (`outfit_result_id`) REFERENCES `outfit_results`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
