CREATE TABLE `style_tags` (
    `id` INTEGER NOT NULL,
    `code` VARCHAR(30) NOT NULL,
    `name` VARCHAR(50) NOT NULL,
    `display_order` INTEGER NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `style_tags_code_key`(`code`),
    UNIQUE INDEX `style_tags_name_key`(`name`),
    UNIQUE INDEX `style_tags_display_order_key`(`display_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `user_style_preferences` (
    `user_id` INTEGER NOT NULL,
    `style_tag_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `user_style_preferences_style_tag_id_idx`(`style_tag_id`),
    PRIMARY KEY (`user_id`, `style_tag_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `style_tags` (`id`, `code`, `name`, `display_order`) VALUES
    (1, 'FORMAL', '포멀', 1),
    (2, 'FEMININE', '페미닌', 2),
    (3, 'MINIMAL', '미니멀', 3),
    (4, 'CASUAL', '캐주얼', 4),
    (5, 'VINTAGE', '빈티지', 5),
    (6, 'STREET', '스트리트', 6);

-- Migrate known legacy JSON values without guessing unknown free-form tags.
-- Legacy implementations used both Korean display names and lowercase English codes.
INSERT IGNORE INTO `user_style_preferences` (`user_id`, `style_tag_id`)
SELECT `users`.`id`, `style_tags`.`id`
FROM `users`
JOIN `style_tags`
    ON JSON_VALID(`users`.`style_tags`)
    AND (
        JSON_CONTAINS(`users`.`style_tags`, JSON_QUOTE(`style_tags`.`name`))
        OR JSON_CONTAINS(`users`.`style_tags`, JSON_QUOTE(`style_tags`.`code`))
        OR JSON_CONTAINS(`users`.`style_tags`, JSON_QUOTE(LOWER(`style_tags`.`code`)))
    )
WHERE `users`.`style_tags` IS NOT NULL;

ALTER TABLE `user_style_preferences`
    ADD CONSTRAINT `user_style_preferences_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `user_style_preferences`
    ADD CONSTRAINT `user_style_preferences_style_tag_id_fkey`
    FOREIGN KEY (`style_tag_id`) REFERENCES `style_tags`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
