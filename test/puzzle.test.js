import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { PuzzleRepository } from '../src/repositories/puzzle.repository.js';
import { PuzzleService } from '../src/services/puzzle.service.js';
import { createAuthError } from '../src/middlewares/auth-context.middleware.js';

class MemoryPuzzleRepository {
    constructor() {
        this.balances = new Map();
        this.transactions = new Map();
        this.nextId = 1;
    }

    async getBalance(userId) { return this.balances.get(userId) ?? 0; }

    async credit(command) {
        const existing = this.transactions.get(command.idempotencyKey);
        if (existing) return existing;
        const balanceAfter = (this.balances.get(command.userId) ?? 0) + command.amount;
        this.balances.set(command.userId, balanceAfter);
        const transaction = {
            id: this.nextId++, type: 'CREDIT', amount: command.amount, balanceAfter,
            reason: command.reason, referenceType: command.referenceType, referenceId: command.referenceId
        };
        this.transactions.set(command.idempotencyKey, transaction);
        return transaction;
    }

    async debit(command) {
        const existing = this.transactions.get(command.idempotencyKey);
        if (existing) return { transaction: existing, insufficient: false };
        const balance = this.balances.get(command.userId) ?? 0;
        if (balance < command.amount) return { transaction: null, insufficient: true };
        const balanceAfter = balance - command.amount;
        this.balances.set(command.userId, balanceAfter);
        const transaction = {
            id: this.nextId++, type: 'DEBIT', amount: command.amount, balanceAfter,
            reason: command.reason, referenceType: command.referenceType, referenceId: command.referenceId
        };
        this.transactions.set(command.idempotencyKey, transaction);
        return { transaction, insufficient: false };
    }
}

const authenticateForTest = (req, res, next) => {
    const userId = Number(req.get('x-test-user-id'));
    if (!Number.isSafeInteger(userId) || userId <= 0) return next(createAuthError());
    req.auth = { userId };
    return next();
};

describe('puzzle balance', () => {
    it('uses the verified JWT subject through the real authentication chain', async () => {
        const repository = new MemoryPuzzleRepository();
        const puzzleService = new PuzzleService({ repository });
        await puzzleService.credit(7, { amount: 3, reason: 'TEST_GRANT', idempotencyKey: 'grant:user:7' });
        const app = createApp({ puzzleService, healthCheck: async () => {} });
        const previousSecret = process.env.JWT_ACCESS_SECRET;
        process.env.JWT_ACCESS_SECRET = 'a-long-test-secret-that-is-at-least-32-chars';
        try {
            const token = jwt.sign({ sub: '7' }, process.env.JWT_ACCESS_SECRET, { algorithm: 'HS256' });
            const response = await request(app)
                .get('/api/v1/puzzles/balance')
                .set('authorization', `Bearer ${token}`);
            assert.equal(response.status, 200);
            assert.equal(response.body.result.balance, 3);

            const denied = await request(app).get('/api/v1/puzzles/balance');
            assert.equal(denied.status, 401);
            assert.equal(denied.body.code, 'AUTH401_01');
        } finally {
            if (previousSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
            else process.env.JWT_ACCESS_SECRET = previousSecret;
        }
    });

    it('returns only the authenticated user balance', async () => {
        const repository = new MemoryPuzzleRepository();
        const puzzleService = new PuzzleService({ repository });
        await puzzleService.credit(1, { amount: 88, reason: 'TEST_GRANT', idempotencyKey: 'grant:user:1' });
        const app = createApp({ puzzleService, authenticate: authenticateForTest, healthCheck: async () => {} });

        const mine = await request(app).get('/api/v1/puzzles/balance').set('x-test-user-id', '1');
        assert.equal(mine.status, 200);
        assert.deepEqual(mine.body.result, { balance: 88, currency: 'PUZZLE' });

        const other = await request(app).get('/api/v1/puzzles/balance').set('x-test-user-id', '2');
        assert.equal(other.status, 200);
        assert.deepEqual(other.body.result, { balance: 0, currency: 'PUZZLE' });
    });

    it('rejects an unauthenticated balance request', async () => {
        const app = createApp({
            puzzleService: new PuzzleService({ repository: new MemoryPuzzleRepository() }),
            authenticate: authenticateForTest,
            healthCheck: async () => {}
        });
        const response = await request(app).get('/api/v1/puzzles/balance');
        assert.equal(response.status, 401);
    });

    it('credits and debits idempotently and rejects an insufficient debit', async () => {
        const service = new PuzzleService({ repository: new MemoryPuzzleRepository() });
        const grant = { amount: 10, reason: 'TEST_GRANT', idempotencyKey: 'grant:1' };
        assert.equal((await service.credit(1, grant)).balance, 10);
        assert.equal((await service.credit(1, grant)).balance, 10);

        const debit = { amount: 4, reason: 'TEST_USE', idempotencyKey: 'use:1' };
        assert.equal((await service.debit(1, debit)).balance, 6);

        await assert.rejects(
            () => service.debit(1, { ...debit, amount: 5 }),
            (error) => error.status === 409 && error.code === 'PUZZLE409_02'
        );
        assert.equal((await service.debit(1, debit)).balance, 6);

        await assert.rejects(
            () => service.debit(1, { amount: 7, reason: 'TEST_USE', idempotencyKey: 'use:2' }),
            (error) => error.status === 409 && error.code === 'PUZZLE409_01'
        );
        assert.equal((await service.getBalance(1)).balance, 6);
    });

    it('rejects an idempotency key replay for another reference', async () => {
        const service = new PuzzleService({ repository: new MemoryPuzzleRepository() });
        const command = {
            amount: 3,
            reason: 'TEST_REWARD',
            idempotencyKey: 'reward:1',
            referenceType: 'ATTENDANCE',
            referenceId: '2026-08-13'
        };
        await service.credit(1, command);

        await assert.rejects(
            () => service.credit(1, { ...command, referenceId: '2026-08-14' }),
            (error) => error.status === 409 && error.code === 'PUZZLE409_02'
        );
    });

    it('recovers a concurrent unique collision as an idempotent replay', async () => {
        const existing = {
            id: 9,
            userId: 1,
            type: 'CREDIT',
            amount: 5,
            balanceAfter: 5,
            reason: 'TEST_GRANT',
            idempotencyKey: 'grant:concurrent',
            referenceType: null,
            referenceId: null
        };
        const prisma = {
            puzzleWallet: {},
            puzzleTransaction: { findUnique: async () => existing },
            $transaction: async () => { throw Object.assign(new Error('unique collision'), { code: 'P2002' }); }
        };
        const repository = new PuzzleRepository(prisma);

        assert.equal((await repository.credit({
            userId: 1,
            amount: 5,
            reason: 'TEST_GRANT',
            idempotencyKey: 'grant:concurrent'
        })).id, 9);
    });

    it('retries a serializable transaction conflict', async () => {
        let attempts = 0;
        const expected = { id: 10 };
        const prisma = {
            puzzleWallet: {},
            puzzleTransaction: { findUnique: async () => null },
            $transaction: async () => {
                attempts += 1;
                if (attempts < 3) throw Object.assign(new Error('write conflict'), { code: 'P2034' });
                return expected;
            }
        };
        const repository = new PuzzleRepository(prisma);

        assert.equal((await repository.credit({
            userId: 1,
            amount: 5,
            reason: 'TEST_GRANT',
            idempotencyKey: 'grant:retry'
        })).id, 10);
        assert.equal(attempts, 3);
    });
});
