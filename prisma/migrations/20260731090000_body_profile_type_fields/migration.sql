ALTER TABLE `body_profiles`
    DROP COLUMN `height_cm`,
    DROP COLUMN `weight_kg`,
    DROP COLUMN `body_type`,
    ADD COLUMN `body_balance` ENUM('UPPER_BODY_DEVELOPED', 'BALANCED', 'LOWER_BODY_DEVELOPED') NULL,
    ADD COLUMN `shoulder_width` ENUM('NARROW', 'AVERAGE', 'WIDE') NULL,
    ADD COLUMN `frame_size` ENUM('SMALL', 'MEDIUM', 'LARGE') NULL;
