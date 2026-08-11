const assertPositiveSafeInteger = (value, fieldName) => {
    if (!Number.isSafeInteger(value) || value <= 0) {
        const error = new Error(`${fieldName} must be a positive safe integer.`);
        error.status = 400;
        error.code = 'REQUEST400';
        throw error;
    }
};

const assertRequiredText = (value, fieldName, maxLength) => {
    if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
        const error = new Error(`${fieldName} is invalid.`);
        error.status = 400;
        error.code = 'REQUEST400';
        throw error;
    }
};

export class PuzzleService {
    constructor({ repository }) {
        this.repository = repository;
    }

    async getBalance(userId) {
        assertPositiveSafeInteger(userId, 'userId');
        return { balance: await this.repository.getBalance(userId), currency: 'PUZZLE' };
    }

    async credit(userId, command) {
        this.validateCommand(userId, command);
        const transaction = await this.repository.credit({ userId, ...command });
        this.assertIdempotentReplay(transaction, 'CREDIT', command);
        return this.toResult(transaction);
    }

    async debit(userId, command) {
        this.validateCommand(userId, command);
        const result = await this.repository.debit({ userId, ...command });
        if (result.insufficient) {
            const error = new Error('Puzzle balance is insufficient.');
            error.status = 409;
            error.code = 'PUZZLE409_01';
            throw error;
        }
        this.assertIdempotentReplay(result.transaction, 'DEBIT', command);
        return this.toResult(result.transaction);
    }

    assertIdempotentReplay(transaction, type, command) {
        if (transaction.type !== type || transaction.amount !== command.amount || transaction.reason !== command.reason) {
            const error = new Error('The idempotency key was already used for another puzzle transaction.');
            error.status = 409;
            error.code = 'PUZZLE409_02';
            throw error;
        }
    }

    validateCommand(userId, command) {
        assertPositiveSafeInteger(userId, 'userId');
        assertPositiveSafeInteger(command?.amount, 'amount');
        assertRequiredText(command?.reason, 'reason', 80);
        assertRequiredText(command?.idempotencyKey, 'idempotencyKey', 128);
        if (command.referenceType != null) assertRequiredText(command.referenceType, 'referenceType', 40);
        if (command.referenceId != null) assertRequiredText(command.referenceId, 'referenceId', 80);
    }

    toResult(transaction) {
        return {
            transactionId: transaction.id,
            type: transaction.type,
            amount: transaction.amount,
            balance: transaction.balanceAfter,
            currency: 'PUZZLE'
        };
    }
}
