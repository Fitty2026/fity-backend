CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `image_assets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `image_type` ENUM('PROFILE', 'BODY_PROFILE', 'CLOSET_ITEM', 'OUTFIT_RESULT') NOT NULL,
    `origin` ENUM('USER_UPLOAD', 'GENERATED', 'FALLBACK') NOT NULL DEFAULT 'USER_UPLOAD',
    `storage_provider` VARCHAR(40) NOT NULL,
    `storage_key` VARCHAR(500) NOT NULL,
    `original_file_name` VARCHAR(255) NULL,
    `mime_type` VARCHAR(100) NOT NULL,
    `file_size_bytes` INTEGER NOT NULL,
    `checksum_sha256` CHAR(64) NOT NULL,
    `status` ENUM('UPLOADING', 'ACTIVE', 'UPLOAD_FAILED', 'DELETE_PENDING', 'DELETE_FAILED', 'DELETED') NOT NULL DEFAULT 'UPLOADING',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `image_assets_storage_key_key`(`storage_key`),
    INDEX `image_assets_user_id_status_idx`(`user_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `image_assets`
    ADD CONSTRAINT `image_assets_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
