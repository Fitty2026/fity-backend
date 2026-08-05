ALTER TABLE `outfit_generation_jobs`
    ADD COLUMN `input_snapshot` JSON NULL;

ALTER TABLE `outfit_results`
    ADD COLUMN `outfit_items` JSON NULL;
