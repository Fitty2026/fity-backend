import assert from 'node:assert/strict';
import { before, beforeEach, describe, it } from 'node:test';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { AuthService } from '../src/services/auth.service.js';
import { authenticateJwt } from '../src/middlewares/auth-context.middleware.js';

class MemoryAuthRepository {
    constructor() {
        this.users = new Map();
        this.nextId = 1;
    }

    async findByEmail(email) {
        return this.users.get(email) || null;
    }

    async create({ email, passwordHash, name }) {
        if (this.users.has(email)) {
            const error = new Error('unique constraint');
            error.code = 'P2002';
            throw error;
        }
        const user = { id: this.nextId++, email, passwordHash, name };
        this.users.set(email, user);
        return user;
    }
}

const TEST_SECRET = 'test-jwt-secret-that-is-longer-than-32-characters';
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
    it('hashes a password and returns a signed access token on signup', async () => {
        const response = await request(app).post('/api/v1/auth/signup').send({
            email: ' User@Example.com ',
            password: 'password123',
            name: ' Fitty '
        });

        assert.equal(response.status, 200);
        assert.equal(response.body.result.user.email, 'user@example.com');
        assert.equal(response.body.result.user.name, 'Fitty');
        assert.equal(response.body.result.user.passwordHash, undefined);
        assert.match(response.body.result.accessToken, /^[\w-]+\.[\w-]+\.[\w-]+$/);
        assert.notEqual(repository.users.get('user@example.com').passwordHash, 'password123');
        assert.equal(jwt.verify(response.body.result.accessToken, TEST_SECRET).sub, '1');
    });

    it('rejects duplicate signup and invalid credential input', async () => {
        const payload = { email: 'user@example.com', password: 'password123' };
        await request(app).post('/api/v1/auth/signup').send(payload).expect(200);
        const duplicate = await request(app).post('/api/v1/auth/signup').send(payload);
        assert.equal(duplicate.status, 400);
        assert.equal(duplicate.body.code, 'AUTH4091');

        const invalid = await request(app).post('/api/v1/auth/signup').send({
            email: 'not-an-email', password: 'short'
        });
        assert.equal(invalid.status, 400);
        assert.equal(invalid.body.code, 'AUTH4001');
    });

    it('logs in only with the correct password', async () => {
        await request(app).post('/api/v1/auth/signup').send({
            email: 'user@example.com', password: 'password123'
        }).expect(200);

        const success = await request(app).post('/api/v1/auth/login').send({
            email: 'user@example.com', password: 'password123'
        });
        assert.equal(success.status, 200);
        assert.equal(success.body.result.tokenType, 'Bearer');

        const failure = await request(app).post('/api/v1/auth/login').send({
            email: 'user@example.com', password: 'incorrect-password'
        });
        assert.equal(failure.status, 401);
        assert.equal(failure.body.code, 'AUTH4012');
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
        assert.equal(rejected.body.code, 'AUTH4011');
    });
});
