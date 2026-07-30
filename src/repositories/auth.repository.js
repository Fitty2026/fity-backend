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

    async create({ username, email, passwordHash, name }) {
        return this.getPrisma().user.create({
            data: { username, email, passwordHash, name }
        });
    }
}
