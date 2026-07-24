export class AuthRepository {
    constructor(getPrisma) {
        this.getPrisma = getPrisma;
    }

    async findByEmail(email) {
        return this.getPrisma().user.findUnique({ where: { email } });
    }

    async create({ email, passwordHash, name }) {
        return this.getPrisma().user.create({
            data: { email, passwordHash, name }
        });
    }
}
