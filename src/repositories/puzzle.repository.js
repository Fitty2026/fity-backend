export class PuzzleRepository {
    constructor(prismaOrProvider) {
        this.prismaProvider = typeof prismaOrProvider === 'function' ? prismaOrProvider : () => prismaOrProvider;
    }

    get prisma() {
        const prisma = this.prismaProvider();
        if (!prisma?.puzzleWallet || !prisma?.puzzleTransaction) {
            throw new TypeError('A Prisma client with puzzle models is required.');
        }
        return prisma;
    }

    async getBalance(userId) {
        const wallet = await this.prisma.puzzleWallet.findUnique({ where: { userId } });
        return wallet?.balance ?? 0;
    }

    async runTransaction(command, operation, mapReplay) {
        const prisma = this.prisma;
        for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
                return await prisma.$transaction(operation, { isolationLevel: 'Serializable' });
            } catch (error) {
                if (error.code === 'P2002') {
                    const existing = await prisma.puzzleTransaction.findUnique({
                        where: {
                            userId_idempotencyKey: {
                                userId: command.userId,
                                idempotencyKey: command.idempotencyKey
                            }
                        }
                    });
                    if (existing) return mapReplay(existing);
                }
                if (error.code !== 'P2034' || attempt === 2) throw error;
            }
        }
        throw new Error('Puzzle transaction retry exhausted.');
    }

    credit({ userId, amount, reason, idempotencyKey, referenceType, referenceId }) {
        const command = { userId, amount, reason, idempotencyKey, referenceType, referenceId };
        return this.runTransaction(command, async (tx) => {
            const existing = await tx.puzzleTransaction.findUnique({
                where: { userId_idempotencyKey: { userId, idempotencyKey } }
            });
            if (existing) return existing;

            const wallet = await tx.puzzleWallet.upsert({
                where: { userId },
                create: { userId, balance: amount },
                update: { balance: { increment: amount } }
            });

            return tx.puzzleTransaction.create({
                data: { userId, type: 'CREDIT', amount, balanceAfter: wallet.balance, reason, idempotencyKey, referenceType, referenceId }
            });
        }, (existing) => existing);
    }

    debit({ userId, amount, reason, idempotencyKey, referenceType, referenceId }) {
        const command = { userId, amount, reason, idempotencyKey, referenceType, referenceId };
        return this.runTransaction(command, async (tx) => {
            const existing = await tx.puzzleTransaction.findUnique({
                where: { userId_idempotencyKey: { userId, idempotencyKey } }
            });
            if (existing) return { transaction: existing, insufficient: false };

            await tx.puzzleWallet.upsert({
                where: { userId },
                create: { userId, balance: 0 },
                update: {}
            });
            const updated = await tx.puzzleWallet.updateMany({
                where: { userId, balance: { gte: amount } },
                data: { balance: { decrement: amount } }
            });
            if (updated.count !== 1) return { transaction: null, insufficient: true };

            const wallet = await tx.puzzleWallet.findUniqueOrThrow({ where: { userId } });
            const transaction = await tx.puzzleTransaction.create({
                data: { userId, type: 'DEBIT', amount, balanceAfter: wallet.balance, reason, idempotencyKey, referenceType, referenceId }
            });
            return { transaction, insufficient: false };
        }, (existing) => ({ transaction: existing, insufficient: false }));
    }
}
