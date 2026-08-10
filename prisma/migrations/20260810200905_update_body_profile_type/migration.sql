-- AlterTable
ALTER TABLE `body_profiles` ADD COLUMN `analysis_id` INTEGER NULL,
    ADD COLUMN `body_type` VARCHAR(191) NULL,
    ADD COLUMN `chest_circumference` DOUBLE NULL,
    ADD COLUMN `hip_circumference` DOUBLE NULL,
    ADD COLUMN `leg_length` DOUBLE NULL,
    ADD COLUMN `lower_body_length` DOUBLE NULL,
    ADD COLUMN `shoulder_width_cm` DOUBLE NULL,
    ADD COLUMN `upper_body_length` DOUBLE NULL,
    ADD COLUMN `waist_circumference` DOUBLE NULL;

-- AlterTable
ALTER TABLE `saved_outfits` ALTER COLUMN `updated_at` DROP DEFAULT;

-- AlterTable
ALTER TABLE `style_tags` ALTER COLUMN `updated_at` DROP DEFAULT;
