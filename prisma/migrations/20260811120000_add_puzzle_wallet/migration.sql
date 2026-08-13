CREATE TABLE `puzzle_wallets` (
    `user_id` INTEGER NOT NULL,
    `balance` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`user_id`),
    CONSTRAINT `puzzle_wallets_user_id_fkey`
        FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `puzzle_wallets_balance_check` CHECK (`balance` >= 0)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `puzzle_transactions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `type` ENUM('CREDIT', 'DEBIT') NOT NULL,
    `amount` INTEGER NOT NULL,
    `balance_after` INTEGER NOT NULL,
    `reason` VARCHAR(80) NOT NULL,
    `idempotency_key` VARCHAR(128) NOT NULL,
    `reference_type` VARCHAR(40) NULL,
    `reference_id` VARCHAR(80) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `puzzle_transactions_user_id_idempotency_key_key` (`user_id`, `idempotency_key`),
    INDEX `puzzle_transactions_user_id_created_at_idx` (`user_id`, `created_at`),
    PRIMARY KEY (`id`),
    CONSTRAINT `puzzle_transactions_user_id_fkey`
        FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `puzzle_transactions_amount_check` CHECK (`amount` > 0),
    CONSTRAINT `puzzle_transactions_balance_after_check` CHECK (`balance_after` >= 0)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
