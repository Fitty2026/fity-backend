import assert from 'node:assert/strict';
import { before, beforeEach, test } from 'node:test';
import { createApp } from '../src/app.js';
import { UserProfileService } from '../src/services/user-profile.service.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

const createPrisma = () => {
    const state = {
        users: new Map([
            [7, { id: 7, username: 'owner7', email: 'owner@example.com', passwordHash: 'secret-hash', name: 'Owner', styleTags: null, createdAt: '2026-07-24T00:00:00.000Z', updatedAt: '2026-07-24T00:00:00.000Z' }],
            [8, { id: 8, username: null, email: 'other@example.com', passwordHash: 'other-hash', name: 'Other', styleTags: null, createdAt: '2026-07-24T00:00:00.000Z', updatedAt: '2026-07-24T00:00:00.000Z' }]
        ]),
        bodyProfiles: new Map(),
        nextBodyProfileId: 1
    };
    return {
        state,
        user: {
            findUnique: async ({ where }) => {
                const user = state.users.get(where.id);
                if (!user) return null;
                return clone(user);
            },
            update: async ({ where, data }) => {
                const user = state.users.get(where.id);
                if (!user) { const error = new Error('missing'); error.code = 'P2025'; throw error; }
                Object.assign(user, data, { updatedAt: new Date().toISOString() });
                return clone(user);
            }
        },
        bodyProfile: {
            findUnique: async ({ where }) => clone(state.bodyProfiles.get(where.userId) || null),
            upsert: async ({ where, create, update }) => {
                const current = state.bodyProfiles.get(where.userId);
                if (current) Object.assign(current, update, { updatedAt: new Date().toISOString() });
                else state.bodyProfiles.set(where.userId, {
                    id: state.nextBodyProfileId++, ...create,
                    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
                });
                return clone(state.bodyProfiles.get(where.userId));
            }
        }
    };
};

const authenticateForTest = (req, res, next) => {
    const userId = Number(req.get('x-test-user-id'));
    if (Number.isSafeInteger(userId) && userId > 0) { req.auth = { userId }; return next(); }
    return next(Object.assign(new Error('인증이 필요합니다.'), { status: 401, code: 'AUTH4011' }));
};

let request;
let api;
let prisma;

before(async () => ({ default: request } = await import('supertest')));
beforeEach(() => {
    prisma = createPrisma();
    api = request(createApp({
        userProfileService: new UserProfileService({ prisma }),
        authenticate: authenticateForTest,
        healthCheck: async () => {}
    }));
});

test('User/Profile routes fail closed without req.auth.userId', async () => {
    const response = await api.get('/api/v1/users/me');
    assert.equal(response.status, 401);
    assert.equal(response.body.code, 'AUTH4011');
});

test('user profile reads and updates only the authenticated user with an allowlist', async () => {
    const initial = await api.get('/api/v1/users/me').set('x-test-user-id', '7');
    assert.equal(initial.status, 200);
    assert.equal(initial.body.result.username, 'owner7');
    assert.equal(initial.body.result.email, 'owner@example.com');
    assert.equal(initial.body.result.passwordHash, undefined);

    const updated = await api.patch('/api/v1/users/me').set('x-test-user-id', '7').send({
        userId: 8, name: 'Updated owner', styleTags: ['casual', 'minimal']
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.result.id, 7);
    assert.equal(updated.body.result.name, 'Updated owner');
    assert.deepEqual(updated.body.result.styleTags, ['casual', 'minimal']);
    assert.equal(prisma.state.users.get(8).name, 'Other');
    assert.equal(prisma.state.users.get(7).passwordHash, 'secret-hash');

    const unsafe = await api.patch('/api/v1/users/me').set('x-test-user-id', '7').send({ email: 'attacker@example.com' });
    assert.equal(unsafe.status, 400);
    assert.equal(unsafe.body.code, 'USER4002');
    assert.equal(prisma.state.users.get(7).email, 'owner@example.com');
});

test('onboarding style and body profile ignore a body userId', async () => {
    const onboarding = await api.post('/api/v1/users/onboarding/style').set('x-test-user-id', '7').send({
        userId: 8, styles: ['street']
    });
    assert.equal(onboarding.status, 200);
    assert.deepEqual(prisma.state.users.get(7).styleTags, ['street']);
    assert.equal(prisma.state.users.get(8).styleTags, null);

    const saved = await api.put('/api/v1/body-profiles/me').set('x-test-user-id', '7').send({
        userId: 8, heightCm: 174, weightKg: 67.5, bodyType: 'straight'
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.result.heightCm, 174);
    assert.equal(saved.body.result.weightKg, 67.5);
    assert.equal(prisma.state.bodyProfiles.get(7).userId, 7);
    assert.equal(prisma.state.bodyProfiles.get(8), undefined);

    const loaded = await api.get('/api/v1/body-profiles/me').set('x-test-user-id', '7');
    assert.equal(loaded.status, 200);
    assert.equal(loaded.body.result.bodyType, 'straight');
});
