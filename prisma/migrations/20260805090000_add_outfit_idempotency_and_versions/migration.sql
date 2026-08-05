ALTER TABLE `outfit_generation_jobs`
    ADD COLUMN `idempotency_key` VARCHAR(128) NULL,
    ADD COLUMN `input_schema_version` VARCHAR(40) NOT NULL DEFAULT 'outfit-input-v1';

CREATE UNIQUE INDEX `outfit_generation_jobs_user_id_idempotency_key_key`
    ON `outfit_generation_jobs`(`user_id`, `idempotency_key`);

ALTER TABLE `outfit_results`
    ADD COLUMN `model_version` VARCHAR(80) NOT NULL DEFAULT 'legacy',
    ADD COLUMN `prompt_version` VARCHAR(80) NULL;
