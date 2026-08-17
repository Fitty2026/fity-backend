-- AlterTable
ALTER TABLE `body_profiles` ADD COLUMN `lower_body_ratio` INTEGER NULL,
    ADD COLUMN `upper_body_ratio` INTEGER NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `selected_body_type` VARCHAR(60) NULL;

-- CreateTable
CREATE TABLE `body_analysis_sessions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `result_data` JSON NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `body_analysis_sessions_user_id_expires_at_idx`(`user_id`, `expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `body_analysis_sessions` ADD CONSTRAINT `body_analysis_sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
