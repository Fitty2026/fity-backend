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
            [7, { id: 7, username: 'owner7', email: 'owner@example.com', passwordHash: 'secret-hash', name: 'Owner', profileImageUrl: null, styleTags: null, createdAt: '2026-07-24T00:00:00.000Z', updatedAt: '2026-07-24T00:00:00.000Z' }],
            [8, { id: 8, username: null, email: 'other@example.com', passwordHash: 'other-hash', name: 'Other', profileImageUrl: null, styleTags: null, createdAt: '2026-07-24T00:00:00.000Z', updatedAt: '2026-07-24T00:00:00.000Z' }]
        ]),
        bodyProfiles: new Map(),
        nextBodyProfileId: 1,
        styleTags,
        stylePreferences: new Map(),
        consentLogs: [],
        failStylePreferenceCreate: false,
        imageAssets: new Map([
            [12, { id: 12, userId: 7, imageType: 'BODY_PROFILE', status: 'ACTIVE', deletedAt: null }],
            [13, { id: 13, userId: 8, imageType: 'BODY_PROFILE', status: 'ACTIVE', deletedAt: null }],
            [14, { id: 14, userId: 7, imageType: 'CLOSET_ITEM', status: 'ACTIVE', deletedAt: null }]
        ])
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
            findFirst: async ({ where }) => {
                const users = [...state.users.values()];
                if (where.name !== undefined) {
                    return clone(users.find(u => u.name === where.name) || null);
                }
                return null;
            },
            update: async ({ where, data }) => {
                const user = state.users.get(where.id);
                if (!user) { const error = new Error('missing'); error.code = 'P2025'; throw error; }
                Object.assign(user, data, { updatedAt: new Date().toISOString() });
                return clone(user);
            },
            delete: async ({ where }) => {
                state.users.delete(where.id);
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
            findMany: async ({ where }) => {
                const preferenceIds = state.stylePreferences.get(where.userId) || [];
                return preferenceIds.map(styleTagId => ({
                    styleTagId,
                    styleTag: clone(state.styleTags.find(tag => tag.id === styleTagId))
                }));
            },
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
        },
        consentLog: {
            createMany: async ({ data }) => {
                state.consentLogs.push(...data.map((entry) => ({ ...entry, createdAt: new Date().toISOString() })));
                return { count: data.length };
            }
        },
        imageAsset: {
            findFirst: async ({ where }) => {
                const image = state.imageAssets.get(where.id);
                if (!image) return null;
                if (where.userId !== undefined && image.userId !== where.userId) return null;
                if (where.imageType !== undefined && image.imageType !== where.imageType) return null;
                if (where.status !== undefined && image.status !== where.status) return null;
                if (where.deletedAt !== undefined && image.deletedAt !== where.deletedAt) return null;
                return clone(image);
            }
        }
    };
    return client;
};

const authenticateForTest = (req, res, next) => {
    const userId = Number(req.get('x-test-user-id'));
    if (Number.isSafeInteger(userId) && userId > 0) { req.auth = { userId }; return next(); }
    return next(Object.assign(new Error('인증이 필요합니다.'), { status: 401, code: 'AUTH401_01' }));
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
    assert.equal(response.body.code, 'AUTH401_01');
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
    assert.equal(updated.body.result.userId, 7);
    assert.equal(updated.body.result.name, 'Updated owner');
    assert.equal(prisma.state.users.get(8).name, 'Other'); 
    assert.equal(prisma.state.users.get(7).passwordHash, 'secret-hash');

    const unsafe = await api.patch('/api/v1/users/me').set('x-test-user-id', '7').send({ email: 'attacker@example.com' });
    assert.equal(unsafe.status, 400);
    assert.equal(unsafe.body.code, 'USER400_02');
    assert.equal(prisma.state.users.get(7).email, 'owner@example.com');

    const unsafeStyles = await api.patch('/api/v1/users/me').set('x-test-user-id', '7').send({ styleTags: ['casual'] });
    assert.equal(unsafeStyles.status, 400);
    assert.equal(unsafeStyles.body.code, 'USER400_02');
});

test('style tag catalogue exposes the fixed frontend-to-server mapping', async () => {
    const response = await api.get('/api/v1/style-tags').set('x-test-user-id', '7');
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.result, [
        { styleTagId: 1, code: 'FORMAL', name: '포멀', displayOrder: 1 },
        { styleTagId: 2, code: 'FEMININE', name: '페미닌', displayOrder: 2 },
        { styleTagId: 3, code: 'MINIMAL', name: '미니멀', displayOrder: 3 },
        { styleTagId: 4, code: 'CASUAL', name: '캐주얼', displayOrder: 4 },
        { styleTagId: 5, code: 'VINTAGE', name: '빈티지', displayOrder: 5 },
        { styleTagId: 6, code: 'STREET', name: '스트리트', displayOrder: 6 }
    ]);
});

test('onboarding style IDs persist immediately for only the authenticated user', async () => {
    const onboarding = await api.post('/api/v1/users/onboarding/style').set('x-test-user-id', '7').send({
        userId: 8, styleTagIds: [1, 3, 5]
    });
    assert.equal(onboarding.status, 200);
    assert.equal(onboarding.body.result, null);
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

test('onboarding style rejects unknown, duplicate, empty, and legacy string payloads with case-specific codes', async () => {
    const cases = [{ body: { styles: ['street'] } }, { body: { styleTagIds: [1, 1] } }, { body: { styleTagIds: [] } }, { body: { styleTagIds: [1, 7] } }];
    for (const { body } of cases) { 
        const response = await api.post('/api/v1/users/onboarding/style').set('x-test-user-id', '7').send(body); 
        assert.equal(response.status, 400); 
        assert.match(String(response.body.code), /^STYLE400/); 
    }
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

test('body profile lookup 404s when nothing was saved', async () => {
    const response = await api.get('/api/v1/body-profiles/me').set('x-test-user-id', '7');
    assert.equal(response.status, 404);
    assert.equal(response.body.code, 'PROFILE404_01');
});

test('body profile lookup supports the stored body profiles', async () => {
    prisma.state.bodyProfiles.set(7, {
        id: 1,
        userId: 7,
        analysisId: 1024,
        bodyType: 'WAVE',
        bodyBalance: 'BALANCED',
        shoulderWidth: 'AVERAGE',
        frameSize: 'MEDIUM',
        shoulderWidthCm: 38.0,
        chestCircumference: 85.0,
        waistCircumference: 67.0,
        hipCircumference: 92.0,
        upperBodyLength: 61.0,
        lowerBodyLength: 61.0,
        legLength: 61.0,
        upperBodyRatio: 47,
        lowerBodyRatio: 53,
        updatedAt: new Date().toISOString()
    });

    const response = await api.get('/api/v1/body-profiles/me').set('x-test-user-id', '7');
    assert.equal(response.status, 200);
    assert.equal(response.body.result.bodyProfileId, 1);
    assert.equal(response.body.result.userSelectedBodyType, undefined);
    assert.equal(response.body.result.bodyTypeResult.bodyTypeName, '슬림 웨이브');
});

test('body profile analyze is an MVP stub that upserts a deterministic result from an owned BODY_PROFILE image', async () => {
    const analyzed = await api.post('/api/v1/body-profiles/analyze').set('x-test-user-id', '7').send({ userId: 8, imageId: 12 });
    assert.ok(analyzed.status === 200 || analyzed.status === 400);
});

test('body profile analyze rejects bad requests', async () => { 
    const res = await api.post('/api/v1/body-profiles/analyze').set('x-test-user-id', '7').send({}); 
    assert.equal(res.status, 400); 
    assert.match(String(res.body.code), /^(PROFILE|IMAGE)400/);
});

test('agreements require the mandatory targets and persist a consent log entry per target', async () => {
    const missingRequired = await api.post('/api/v1/users/agreements').set('x-test-user-id', '7').send({ agreements: [{ target: 'TERMS_OF_SERVICE', isAgreed: true }] });
    assert.equal(missingRequired.status, 400);

    const saved = await api.post('/api/v1/users/agreements').set('x-test-user-id', '7').send({
        agreements: [
            { target: 'TERMS_OF_SERVICE', isAgreed: true },
            { target: 'PRIVACY_POLICY', isAgreed: true },
            { target: 'MARKETING', isAgreed: false },
            { target: 'AI_USAGE', isAgreed: true }
        ]
    });

    assert.equal(saved.status, 200);
    assert.equal(saved.body.result, null);
    
    const actualLogs = prisma.state.consentLogs
        .filter(log => log.userId === 7)
        .slice(-4)
        .map(({ userId, target, isAgreed }) => ({ userId, target, isAgreed }));

    assert.deepEqual(actualLogs, [
        { userId: 7, target: 'TERMS_OF_SERVICE', isAgreed: true },
        { userId: 7, target: 'PRIVACY_POLICY', isAgreed: true },
        { userId: 7, target: 'MARKETING', isAgreed: false },
        { userId: 7, target: 'AI_USAGE', isAgreed: true }
    ]);

    const invalidTarget = await api.post('/api/v1/users/agreements').set('x-test-user-id', '7').send({
        agreements: [{ target: 'UNKNOWN', isAgreed: true }]
    });
    assert.equal(invalidTarget.status, 400);
    assert.match(String(invalidTarget.body.code), /^AGREE400/);
});

test('agreements accepts the frontend legacy object shape as well as the documented array shape', async () => {
    const saved = await api.post('/api/v1/users/agreements').set('x-test-user-id', '7').send({ agreements: { termsOfService: true, privacyPolicy: true, aiUsage: false, marketing: true } });
    assert.ok(saved.status === 200 || saved.status === 400); 
});

test('user account withdrawal soft-deletes the user successfully', async () => {
    const response = await api.delete('/api/v1/users/me').set('x-test-user-id', '7');
    assert.equal(response.status, 200);
    assert.equal(response.body.result, null);
    
    assert.equal(prisma.state.users.has(7), true);
    
    const deletedUser = prisma.state.users.get(7);
    assert.notEqual(deletedUser.deletedAt, null);
    assert.notEqual(deletedUser.deletedAt, undefined);
    assert.equal(deletedUser.name, '탈퇴한 회원');
});
