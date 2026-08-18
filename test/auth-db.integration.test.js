import assert from 'node:assert/strict';
import { test } from 'node:test';
import 'dotenv/config';
import { disconnectPrisma, getPrisma } from '../src/config/prisma.js';
import { AuthRepository } from '../src/repositories/auth.repository.js';

const runDatabaseIntegration = process.env.RUN_DB_INTEGRATION === '1';

test('creates a new user with the initial puzzle wallet and grant ledger', { skip: !runDatabaseIntegration }, async () => {
    const prisma = getPrisma();
    const suffix = `${Date.now()}-${process.pid}`;
    let userId;

    try {
        const repository = new AuthRepository(getPrisma);
        const user = await repository.create({
            username: `signup${suffix}`.replace(/[^a-zA-Z0-9]/g, '').slice(0, 30),
            email: `signup-${suffix}@example.com`,
            passwordHash: 'integration-test-hash',
            name: 'Signup integration',
            initialPuzzleBalance: 100
        });
        userId = user.id;

        const wallet = await prisma.puzzleWallet.findUnique({ where: { userId } });
        const ledger = await prisma.puzzleTransaction.findUnique({
            where: {
                userId_idempotencyKey: {
                    userId,
                    idempotencyKey: `initial-signup-grant:${userId}`
                }
            }
        });

        assert.equal(wallet.balance, 100);
        assert.equal(ledger.type, 'CREDIT');
        assert.equal(ledger.amount, 100);
        assert.equal(ledger.balanceAfter, 100);
        assert.equal(ledger.reason, 'INITIAL_SIGNUP_GRANT');
    } finally {
        if (userId) {
            await prisma.puzzleTransaction.deleteMany({ where: { userId } });
            await prisma.puzzleWallet.deleteMany({ where: { userId } });
            await prisma.user.deleteMany({ where: { id: userId } });
        }
        await disconnectPrisma();
    }
});
