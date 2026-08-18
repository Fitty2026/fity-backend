import assert from 'node:assert/strict';
import { before, beforeEach, describe, it } from 'node:test';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { AuthRepository } from '../src/repositories/auth.repository.js';
import { AuthService } from '../src/services/auth.service.js';
import { authenticateJwt } from '../src/middlewares/auth-context.middleware.js';

class MemoryAuthRepository {
    constructor() {
        this.users = new Map();
        this.initialPuzzleBalances = new Map();
        this.nextId = 1;
    }

    async findByEmail(email) {
        return this.users.get(email) || null;
    }

    async findByUsername(username) {
        return [...this.users.values()].find((user) => user.username === username) || null;
    }

    async create({ username, email, passwordHash, name, initialPuzzleBalance }) {
        if (this.users.has(email) || await this.findByUsername(username)) {
            const error = new Error('unique constraint');
            error.code = 'P2002';
            throw error;
        }
        const user = { id: this.nextId++, username, email, passwordHash, name, createdAt: new Date().toISOString() };
        this.users.set(email, user);
        this.initialPuzzleBalances.set(user.id, initialPuzzleBalance);
        return user;
    }
}

const TEST_SECRET = 'test-jwt-secret-that-is-longer-than-32-characters';
const VALID_PW = 'Password123!';

let request;
let app;
let repository;

before(async () => {
    ({ default: request } = await import('supertest'));
});

beforeEach(() => {
    process.env.JWT_ACCESS_SECRET = TEST_SECRET;
    process.env.JWT_ACCESS_EXPIRES_IN = '1h';
    repository = new MemoryAuthRepository();
    app = createApp({
        authService: new AuthService({ repository }),
        healthCheck: async () => {}
    });
});

describe('BE1 auth API', () => {
    it('hashes a password and returns the spec signup contract without a token', async () => {
        const response = await request(app).post('/api/v1/auth/signup').send({
            loginId: 'fitty1234',
            email: ' User@Example.com ',
            password: VALID_PW,
            name: ' Fitty '
        });


        assert.equal(response.status, 200);
        assert.equal(response.body.result.userId, 1);
        assert.equal(response.body.result.loginId, 'fitty1234');
        assert.equal(response.body.result.email, 'user@example.com');
        assert.equal(response.body.result.name, 'Fitty');
        assert.equal(response.body.result.accessToken, undefined);
        assert.ok(response.body.result.createdAt);
        assert.notEqual(repository.users.get('user@example.com').passwordHash, 'password123');
        assert.equal(repository.initialPuzzleBalances.get(1), 100);
    });

    it('rejects duplicate signup and invalid credential input', async () => {
        const payload = {
            loginId: 'fitty1234',
            email: 'user@example.com',
            password: VALID_PW,
            name: 'Fitty'
        };
        await request(app).post('/api/v1/auth/signup').send(payload).expect(200);
        const duplicate = await request(app).post('/api/v1/auth/signup').send(payload);
        assert.equal(duplicate.status, 400);
        assert.match(String(duplicate.body.code), /^SIGNUP/);

        const duplicateUsername = await request(app).post('/api/v1/auth/signup').send({
            ...payload,
            email: 'other@example.com'
        });
        assert.equal(duplicateUsername.status, 400);

    });

    it('requires all four Figma signup fields', async () => {
        const payload = {
            loginId: 'fitty1234',
            email: 'user@example.com',
            password: VALID_PW,
            name: 'Fitty'
        };

        for (const field of Object.keys(payload)) {
            const requestBody = { ...payload };
            delete requestBody[field];
            const response = await request(app).post('/api/v1/auth/signup').send(requestBody);
            assert.equal(response.status, 400);
            assert.match(String(response.body.code), /^SIGNUP400/);
        }
    });

    it('validates loginId and name independently', async () => {
        const payload = {
            loginId: 'fitty1234',
            email: 'user@example.com',
            password: VALID_PW,
            name: 'Fitty'
        };
        const invalidLoginIds = ['abc', 'a'.repeat(21), '한글아이디', 'fitty_user'];

        for (const loginId of invalidLoginIds) {
            const response = await request(app).post('/api/v1/auth/signup').send({ ...payload, loginId });
        }

        const invalidName = await request(app).post('/api/v1/auth/signup').send({ ...payload, name: '   ' });
        assert.equal(invalidName.status, 400); 
        assert.match(String(invalidName.body.code), /^SIGNUP/);
    });

    it('maps Prisma adapter unique constraints to stable conflict codes', async () => {
        const createConflictApp = (index) => createApp({
            authService: new AuthService({
                repository: {
                    findByEmail: async () => null,
                    findByUsername: async () => null,
                    create: async () => {
                        const error = new Error('unique constraint');
                        error.code = 'P2002';
                        error.meta = {
                            driverAdapterError: { cause: { constraint: { index } } }
                        };
                        throw error;
                    }
                }
            }),
            healthCheck: async () => {}
        });
        const payload = {
            loginId: 'fitty1234',
            email: 'user@example.com',
            password: VALID_PW,
            name: 'Fitty'
        };

        const usernameConflict = await request(createConflictApp('users_username_key'))
            .post('/api/v1/auth/signup')
            .send(payload);
        assert.equal(usernameConflict.body.code, 'SIGNUP409_02');

        const emailConflict = await request(createConflictApp('users_email_key'))
            .post('/api/v1/auth/signup')
            .send(payload);
        assert.equal(emailConflict.body.code, 'SIGNUP409_01');
    });

    it('does not accept agreement fields during signup', async () => {
        const response = await request(app).post('/api/v1/auth/signup').send({ loginId: 'fitty1234', email: 'user@example.com', password: VALID_PW, name: 'Fitty', agreements: [{ type: 'terms', agreed: true }] });
        assert.equal(response.status, 200);
    });

    it('logs in only with the correct password and returns the spec login contract', async () => {
        await request(app).post('/api/v1/auth/signup').send({
            loginId: 'fitty1234',
            email: 'user@example.com',
            password: VALID_PW,
            name: 'Fitty'
        }).expect(200);

        const success = await request(app).post('/api/v1/auth/login').send({
            email: 'user@example.com', password: VALID_PW
        });
        assert.equal(success.status, 200);
        assert.equal(success.body.result.userId, 1);
        assert.equal(success.body.result.name, 'Fitty');
        assert.match(success.body.result.accessToken, /^[\w-]+\.[\w-]+\.[\w-]+$/);
        assert.equal(jwt.verify(success.body.result.accessToken, TEST_SECRET).sub, '1');

        const failure = await request(app).post('/api/v1/auth/login').send({
            email: 'user@example.com', password: 'incorrect-password'
        });
        assert.equal(failure.status, 401);
        assert.equal(failure.body.code, 'LOGIN401_02');
    });

    it('sets req.auth only for a verified JWT', async () => {
        const token = jwt.sign({}, TEST_SECRET, { algorithm: 'HS256', subject: '7', expiresIn: '1h' });
        const protectedApp = createApp({
            authService: new AuthService({ repository }),
            authenticate: (req, res, next) => {
                authenticateJwt(req, res, (error) => {
                    if (error) return next(error);
                    res.status(200).json({ userId: req.auth.userId });
                });
            },
            healthCheck: async () => {}
        });
        const verified = await request(protectedApp)
            .get('/api/v1/images/1')
            .set('Authorization', `Bearer ${token}`);
        assert.equal(verified.status, 200);
        assert.equal(verified.body.userId, 7);

        const rejected = await request(protectedApp)
            .get('/api/v1/images/1')
            .set('Authorization', 'Bearer invalid');
        assert.equal(rejected.status, 401);
        assert.equal(rejected.body.code, 'AUTH401_03');
    });
});

describe('AuthRepository', () => {
    it('creates the user, initial wallet, and grant ledger in one transaction', async () => {
        const writes = [];
        let transactionOptions;
        const tx = {
            user: {
                create: async ({ data }) => {
                    writes.push(['user', data]);
                    return { id: 7, createdAt: new Date(), ...data };
                }
            },
            puzzleWallet: {
                create: async ({ data }) => {
                    writes.push(['wallet', data]);
                    return data;
                }
            },
            puzzleTransaction: {
                create: async ({ data }) => {
                    writes.push(['ledger', data]);
                    return data;
                }
            }
        };
        const repository = new AuthRepository(() => ({
            $transaction: async (operation, options) => {
                transactionOptions = options;
                return operation(tx);
            }
        }));

        await repository.create({
            username: 'fitty1234',
            email: 'user@example.com',
            passwordHash: 'hash',
            name: 'Fitty',
            initialPuzzleBalance: 100
        });

        assert.deepEqual(transactionOptions, { isolationLevel: 'Serializable' });
        assert.deepEqual(writes[1], ['wallet', { userId: 7, balance: 100 }]);
        assert.deepEqual(writes[2], ['ledger', {
            userId: 7,
            type: 'CREDIT',
            amount: 100,
            balanceAfter: 100,
            reason: 'INITIAL_SIGNUP_GRANT',
            idempotencyKey: 'initial-signup-grant:7',
            referenceType: 'USER',
            referenceId: '7'
        }]);
    });
});
