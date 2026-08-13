/*
  Warnings:

  - You are about to drop the column `size` on the `closet_items` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `closet_items` DROP COLUMN `size`,
    ADD COLUMN `color_hex` VARCHAR(7) NULL;
