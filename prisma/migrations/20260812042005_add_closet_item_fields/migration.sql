-- AlterTable
ALTER TABLE `closet_items` ADD COLUMN `brand` VARCHAR(100) NULL,
    ADD COLUMN `color_text` VARCHAR(50) NULL,
    ADD COLUMN `memo` VARCHAR(500) NULL,
    ADD COLUMN `sub_category` VARCHAR(60) NULL,
    MODIFY `image_id` INTEGER NULL;
