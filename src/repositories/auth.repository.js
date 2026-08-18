export class AuthRepository {
    constructor(getPrisma) {
        this.getPrisma = getPrisma;
    }

    async findByEmail(email) {
        return this.getPrisma().user.findUnique({ where: { email } });
    }

    async findByUsername(username) {
        return this.getPrisma().user.findUnique({ where: { username } });
    }

    async create({ username, email, passwordHash, name, initialPuzzleBalance }) {
        return this.getPrisma().$transaction(async (tx) => {
            const user = await tx.user.create({
                data: { username, email, passwordHash, name }
            });

            const wallet = await tx.puzzleWallet.create({
                data: { userId: user.id, balance: initialPuzzleBalance }
            });
            await tx.puzzleTransaction.create({
                data: {
                    userId: user.id,
                    type: 'CREDIT',
                    amount: initialPuzzleBalance,
                    balanceAfter: wallet.balance,
                    reason: 'INITIAL_SIGNUP_GRANT',
                    idempotencyKey: `initial-signup-grant:${user.id}`,
                    referenceType: 'USER',
                    referenceId: String(user.id)
                }
            });

            return user;
        }, { isolationLevel: 'Serializable' });
    }
}
