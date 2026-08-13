import assert from 'node:assert/strict';
import { test } from 'node:test';
import { disconnectPrisma, getPrisma } from '../src/config/prisma.js';
import { PuzzleRepository } from '../src/repositories/puzzle.repository.js';
import { PuzzleService } from '../src/services/puzzle.service.js';

const runDatabaseIntegration = process.env.RUN_DB_INTEGRATION === '1';

test('persists puzzle balance and an idempotent ledger in MySQL', { skip: !runDatabaseIntegration }, async () => {
    const prisma = getPrisma();
    const suffix = `${Date.now()}-${process.pid}`;
    let userId;

    try {
        const user = await prisma.user.create({
            data: { email: `puzzle-owner-${suffix}@example.com`, name: 'Puzzle owner' }
        });
        userId = user.id;
        const service = new PuzzleService({ repository: new PuzzleRepository(prisma) });

        await service.credit(userId, { amount: 10, reason: 'INTEGRATION_GRANT', idempotencyKey: `grant:${suffix}` });
        await service.credit(userId, { amount: 10, reason: 'INTEGRATION_GRANT', idempotencyKey: `grant:${suffix}` });
        await service.debit(userId, { amount: 4, reason: 'INTEGRATION_USE', idempotencyKey: `use:${suffix}` });

        assert.equal((await service.getBalance(userId)).balance, 6);
        assert.equal(await prisma.puzzleTransaction.count({ where: { userId } }), 2);
        await assert.rejects(
            () => service.debit(userId, { amount: 7, reason: 'INTEGRATION_USE', idempotencyKey: `overdraft:${suffix}` }),
            { code: 'PUZZLE409_01' }
        );
        assert.equal((await service.getBalance(userId)).balance, 6);
    } finally {
        if (userId) {
            await prisma.puzzleTransaction.deleteMany({ where: { userId } });
            await prisma.puzzleWallet.deleteMany({ where: { userId } });
            await prisma.user.deleteMany({ where: { id: userId } });
        }
        await disconnectPrisma();
    }
});
