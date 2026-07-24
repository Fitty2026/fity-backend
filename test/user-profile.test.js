import assert from 'node:assert/strict';
import { before, beforeEach, test } from 'node:test';
import { createApp } from '../src/app.js';
import { UserProfileService } from '../src/services/user-profile.service.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

const createPrisma = () => {
    const styleTags = [
        { id: 1, code: 'FORMAL', name: '포멀', displayOrder: 1, isActive: true },
        { id: 2, code: 'FEMININE', name: '페미닌', displayOrder: 2, isActive: true },
        { id: 3, code: 'MINIMAL', name: '미니멀', displayOrder: 3, isActive: true },
        { id: 4, code: 'CASUAL', name: '캐주얼', displayOrder: 4, isActive: true },
        { id: 5, code: 'VINTAGE', name: '빈티지', displayOrder: 5, isActive: true },
        { id: 6, code: 'STREET', name: '스트리트', displayOrder: 6, isActive: true }
    ];
    const state = {
        users: new Map([
            [7, { id: 7, username: 'owner7', email: 'owner@example.com', passwordHash: 'secret-hash', name: 'Owner', styleTags: null, createdAt: '2026-07-24T00:00:00.000Z', updatedAt: '2026-07-24T00:00:00.000Z' }],
            [8, { id: 8, username: null, email: 'other@example.com', passwordHash: 'other-hash', name: 'Other', styleTags: null, createdAt: '2026-07-24T00:00:00.000Z', updatedAt: '2026-07-24T00:00:00.000Z' }]
        ]),
        bodyProfiles: new Map(),
        nextBodyProfileId: 1,
        styleTags,
        stylePreferences: new Map(),
        failStylePreferenceCreate: false
    };
    const client = {
        state,
        $transaction: async (callback) => {
            const stylePreferencesBefore = new Map(
                [...state.stylePreferences].map(([userId, ids]) => [userId, [...ids]])
            );
            try {
                return await callback(client);
            } catch (error) {
                state.stylePreferences = stylePreferencesBefore;
                throw error;
            }
        },
        user: {
            findUnique: async ({ where, select, include }) => {
                const user = state.users.get(where.id);
                if (!user) return null;
                if (select) return Object.fromEntries(Object.keys(select).filter((key) => select[key]).map((key) => [key, user[key]]));
                const result = clone(user);
                if (include?.stylePreferences) {
                    result.stylePreferences = (state.stylePreferences.get(where.id) || [])
                        .toSorted((a, b) => a - b)
                        .map((styleTagId) => ({
                            styleTagId,
                            styleTag: clone(state.styleTags.find((tag) => tag.id === styleTagId))
                        }));
                }
                return result;
            },
            update: async ({ where, data }) => {
                const user = state.users.get(where.id);
                if (!user) { const error = new Error('missing'); error.code = 'P2025'; throw error; }
                Object.assign(user, data, { updatedAt: new Date().toISOString() });
                return clone(user);
            }
        },
        styleTag: {
            findMany: async ({ where = {}, orderBy, select }) => {
                let tags = state.styleTags.filter((tag) => {
                    if (where.isActive !== undefined && tag.isActive !== where.isActive) return false;
                    if (where.id?.in && !where.id.in.includes(tag.id)) return false;
                    return true;
                });
                if (orderBy?.displayOrder === 'asc') tags = tags.toSorted((a, b) => a.displayOrder - b.displayOrder);
                return tags.map((tag) => select
                    ? Object.fromEntries(Object.keys(select).filter((key) => select[key]).map((key) => [key, tag[key]]))
                    : clone(tag));
            }
        },
        userStylePreference: {
            deleteMany: async ({ where }) => {
                state.stylePreferences.delete(where.userId);
            },
            createMany: async ({ data }) => {
                if (state.failStylePreferenceCreate) throw new Error('forced preference create failure');
                for (const preference of data) {
                    const current = state.stylePreferences.get(preference.userId) || [];
                    current.push(preference.styleTagId);
                    state.stylePreferences.set(preference.userId, current);
                }
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
    return client;
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
    assert.deepEqual(initial.body.result.styleTagIds, []);

    const updated = await api.patch('/api/v1/users/me').set('x-test-user-id', '7').send({
        userId: 8, name: 'Updated owner'
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.result.id, 7);
    assert.equal(updated.body.result.name, 'Updated owner');
    assert.equal(updated.body.result.styleTags, null);
    assert.equal(prisma.state.users.get(8).name, 'Other');
    assert.equal(prisma.state.users.get(7).passwordHash, 'secret-hash');

    const unsafe = await api.patch('/api/v1/users/me').set('x-test-user-id', '7').send({ email: 'attacker@example.com' });
    assert.equal(unsafe.status, 400);
    assert.equal(unsafe.body.code, 'USER4002');
    assert.equal(prisma.state.users.get(7).email, 'owner@example.com');

    const unsafeStyles = await api.patch('/api/v1/users/me').set('x-test-user-id', '7').send({ styleTags: ['casual'] });
    assert.equal(unsafeStyles.status, 400);
    assert.equal(unsafeStyles.body.code, 'USER4002');
});

test('style tag catalogue exposes the fixed frontend-to-server mapping', async () => {
    const response = await api.get('/api/v1/style-tags').set('x-test-user-id', '7');
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.result, [
        { id: 1, code: 'FORMAL', name: '포멀', displayOrder: 1 },
        { id: 2, code: 'FEMININE', name: '페미닌', displayOrder: 2 },
        { id: 3, code: 'MINIMAL', name: '미니멀', displayOrder: 3 },
        { id: 4, code: 'CASUAL', name: '캐주얼', displayOrder: 4 },
        { id: 5, code: 'VINTAGE', name: '빈티지', displayOrder: 5 },
        { id: 6, code: 'STREET', name: '스트리트', displayOrder: 6 }
    ]);
});

test('onboarding style IDs persist immediately for only the authenticated user', async () => {
    const onboarding = await api.post('/api/v1/users/onboarding/style').set('x-test-user-id', '7').send({
        userId: 8, styleTagIds: [1, 3, 5]
    });
    assert.equal(onboarding.status, 200);
    assert.deepEqual(onboarding.body.result.styleTagIds, [1, 3, 5]);
    assert.deepEqual(onboarding.body.result.styles, [
        { id: 1, code: 'FORMAL', name: '포멀', displayOrder: 1 },
        { id: 3, code: 'MINIMAL', name: '미니멀', displayOrder: 3 },
        { id: 5, code: 'VINTAGE', name: '빈티지', displayOrder: 5 }
    ]);
    assert.deepEqual(prisma.state.stylePreferences.get(7), [1, 3, 5]);
    assert.equal(prisma.state.users.get(8).styleTags, null);

    const loaded = await api.get('/api/v1/users/me').set('x-test-user-id', '7');
    assert.equal(loaded.status, 200);
    assert.deepEqual(loaded.body.result.styleTagIds, [1, 3, 5]);
    assert.deepEqual(loaded.body.result.styles.map((style) => style.name), ['포멀', '미니멀', '빈티지']);

    const replaced = await api.post('/api/v1/users/onboarding/style').set('x-test-user-id', '7').send({
        styleTagIds: [4, 6]
    });
    assert.equal(replaced.status, 200);
    assert.deepEqual(prisma.state.stylePreferences.get(7), [4, 6]);
});

test('onboarding style rejects unknown, duplicate, empty, and legacy string payloads', async () => {
    for (const body of [
        { styleTagIds: [1, 7] },
        { styleTagIds: [1, 1] },
        { styleTagIds: [] },
        { styles: ['street'] }
    ]) {
        const response = await api.post('/api/v1/users/onboarding/style').set('x-test-user-id', '7').send(body);
        assert.equal(response.status, 400);
        assert.equal(response.body.code, 'USER4003');
    }
    assert.equal(prisma.state.stylePreferences.get(7), undefined);
});

test('onboarding style keeps existing preferences when validation fails', async () => {
    await api.post('/api/v1/users/onboarding/style').set('x-test-user-id', '7').send({ styleTagIds: [1, 3] });
    const response = await api.post('/api/v1/users/onboarding/style').set('x-test-user-id', '7').send({ styleTagIds: [1, 999] });
    assert.equal(response.status, 400);
    assert.deepEqual(prisma.state.stylePreferences.get(7), [1, 3]);
});

test('onboarding style rolls back replacement when preference creation fails', async () => {
    await api.post('/api/v1/users/onboarding/style').set('x-test-user-id', '7').send({ styleTagIds: [1, 3] });
    prisma.state.failStylePreferenceCreate = true;

    const response = await api.post('/api/v1/users/onboarding/style').set('x-test-user-id', '7').send({ styleTagIds: [4, 6] });
    assert.equal(response.status, 500);
    assert.deepEqual(prisma.state.stylePreferences.get(7), [1, 3]);
});

test('body profile ignores a body userId', async () => {
    const saved = await api.put('/api/v1/body-profiles/me').set('x-test-user-id', '7').send({
        userId: 8, heightCm: 174, weightKg: 67.5, bodyType: 'straight'
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.result.heightCm, 174);
    assert.equal(saved.body.result.weightKg, 67.5);
    assert.equal(prisma.state.bodyProfiles.get(7).userId, 7);
    assert.equal(prisma.state.bodyProfiles.get(8), undefined);

    const response = await api.get('/api/v1/body-profiles/me').set('x-test-user-id', '7');
    assert.equal(response.status, 200);
    assert.equal(response.body.result.bodyType, 'straight');
});
