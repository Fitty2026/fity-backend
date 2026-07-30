CREATE TABLE `closet_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `image_id` INTEGER NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `size` VARCHAR(60) NOT NULL,
    `category` VARCHAR(60) NOT NULL,
    `import_type` VARCHAR(60) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `closet_items_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `closet_items_image_id_idx`(`image_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `item_tags` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `closet_item_id` INTEGER NOT NULL,
    `tag_name` VARCHAR(60) NOT NULL,
    UNIQUE INDEX `item_tags_closet_item_id_tag_name_key`(`closet_item_id`, `tag_name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `shopping_platforms` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `platform_name` VARCHAR(60) NOT NULL,
    UNIQUE INDEX `shopping_platforms_platform_name_key`(`platform_name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `import_sessions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `platform_id` INTEGER NOT NULL,
    `status` VARCHAR(30) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `import_sessions_user_id_created_at_idx`(`user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `consent_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `target` VARCHAR(60) NOT NULL,
    `is_agreed` BOOLEAN NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `consent_logs_user_id_created_at_idx`(`user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `closet_items` ADD CONSTRAINT `closet_items_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `closet_items` ADD CONSTRAINT `closet_items_image_id_fkey` FOREIGN KEY (`image_id`) REFERENCES `image_assets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `item_tags` ADD CONSTRAINT `item_tags_closet_item_id_fkey` FOREIGN KEY (`closet_item_id`) REFERENCES `closet_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `import_sessions` ADD CONSTRAINT `import_sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `import_sessions` ADD CONSTRAINT `import_sessions_platform_id_fkey` FOREIGN KEY (`platform_id`) REFERENCES `shopping_platforms`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `consent_logs` ADD CONSTRAINT `consent_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
