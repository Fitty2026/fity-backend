import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { ClosetService } from '../src/services/closet.service.js';
import { ImageUrlSigner } from '../src/services/image-url-signer.js';

const imageUrlSigner = new ImageUrlSigner({ secret: 'test-image-url-secret-at-least-32-characters', now: () => 1_800_000_000_000 });

const clone = (value) => structuredClone(value);

class MemoryPrisma {
    constructor() {
        this.state = {
            images: [
                { id: 10, userId: 7, imageType: 'CLOSET_ITEM', status: 'ACTIVE', deletedAt: null },
                { id: 11, userId: 8, imageType: 'CLOSET_ITEM', status: 'ACTIVE', deletedAt: null },
                { id: 12, userId: 7, imageType: 'PROFILE', status: 'ACTIVE', deletedAt: null },
                { id: 13, userId: 7, imageType: 'CLOSET_ITEM', status: 'DELETED', deletedAt: new Date() }
            ], items: [], tags: [], platforms: [], consents: [], sessions: [], nextItem: 1, nextTag: 1
        };
        this.failTagCreate = false;
        this.bind(this);
    }
    bind(target) {
        target.imageAsset = { findFirst: async ({ where }) => target.state.images.find((image) => Object.entries(where).every(([key, value]) => image[key] === value)) || null };
        target.closetItem = {
            create: async ({ data, include }) => {
                const item = { id: target.state.nextItem++, ...Object.fromEntries(Object.entries(data).filter(([key]) => key !== 'tags')), createdAt: new Date(), updatedAt: new Date() };
                target.state.items.push(item);
                const tags = [];
                for (const tag of data.tags?.create || []) {
                    if (target.failTagCreate) throw new Error('forced tag failure');
                    const record = { id: target.state.nextTag++, closetItemId: item.id, tagName: tag.tagName };
                    target.state.tags.push(record); tags.push(record);
                }
                return { ...item, ...(include?.tags ? { tags } : {}) };
            },
            findMany: async ({ where }) => target.state.items.filter((item) => item.userId === where.userId && (!where.category || item.category === where.category) && (!where.name || item.name.includes(where.name.contains))).map((item) => ({ ...item, tags: target.state.tags.filter((tag) => tag.closetItemId === item.id) })),
            findFirst: async ({ where, include, select }) => {
                const item = target.state.items.find((candidate) => Object.entries(where).every(([key, value]) => candidate[key] === value));
                if (!item) return null;
                if (select) return { id: item.id };
                return { ...item, ...(include?.tags ? { tags: target.state.tags.filter((tag) => tag.closetItemId === item.id) } : {}) };
            },
            update: async ({ where, data, include }) => {
                const item = target.state.items.find((candidate) => candidate.id === where.id);
                Object.assign(item, Object.fromEntries(Object.entries(data).filter(([key]) => key !== 'tags')), { updatedAt: new Date() });
                if (data.tags) {
                    target.state.tags = target.state.tags.filter((tag) => tag.closetItemId !== item.id);
                    for (const tag of data.tags.create) {
                        if (target.failTagCreate) throw new Error('forced tag failure');
                        target.state.tags.push({ id: target.state.nextTag++, closetItemId: item.id, tagName: tag.tagName });
                    }
                }
                return { ...item, ...(include?.tags ? { tags: target.state.tags.filter((tag) => tag.closetItemId === item.id) } : {}) };
            },
            deleteMany: async ({ where }) => {
                const count = target.state.items.filter((item) => item.id === where.id && item.userId === where.userId).length;
                target.state.items = target.state.items.filter((item) => !(item.id === where.id && item.userId === where.userId));
                target.state.tags = target.state.tags.filter((tag) => !target.state.items.every((item) => item.id !== tag.closetItemId));
                return { count };
            }
        };
        target.consentLog = { create: async ({ data }) => { const record = { id: target.state.consents.length + 1, ...data }; target.state.consents.push(record); return record; } };
        target.shoppingPlatform = { upsert: async ({ where, create }) => { let platform = target.state.platforms.find((entry) => entry.platformName === where.platformName); if (!platform) { platform = { id: target.state.platforms.length + 1, ...create }; target.state.platforms.push(platform); } return platform; } };
        target.importSession = { create: async ({ data }) => { const record = { id: target.state.sessions.length + 1, ...data }; target.state.sessions.push(record); return record; } };
    }
    async $transaction(callback) {
        const before = clone(this.state);
        const tx = { state: this.state, failTagCreate: this.failTagCreate };
        this.bind(tx);
        try { return await callback(tx); } catch (error) { this.state = before; throw error; }
    }
}

const authenticateForTest = (req, res, next) => {
    const userId = Number(req.get('x-test-user-id'));
    if (Number.isSafeInteger(userId) && userId > 0) { req.auth = { userId }; return next(); }
    return next(Object.assign(new Error('인증이 필요합니다.'), { status: 401, code: 'AUTH401_01' }));
};

const fixture = () => {
    const prisma = new MemoryPrisma();
    const app = createApp({ closetService: new ClosetService({ prisma, imageUrlSigner }), authenticate: authenticateForTest, healthCheck: async () => {} });
    return { prisma, api: request(app) };
};
const validItem = {
    imageId: 10,
    name: '셔츠',
    brand: 'Fitty',
    colorText: '화이트',
    subCategory: '옥스퍼드 셔츠',
    memo: '봄 코디용',
    size: 'M',
    category: 'TOP',
    importType: 'MANUAL',
    tags: ['여름', '흰색']
};

test('Closet routes fail closed without req.auth.userId', async () => {
    const { api } = fixture();
    for (const [method, path] of [['post', '/api/v1/closets/sync'], ['get', '/api/v1/closets/items'], ['post', '/api/v1/closets/items'], ['patch', '/api/v1/closets/items/1'], ['delete', '/api/v1/closets/items/1']]) {
        const response = await api[method](path).send(validItem);
        assert.equal(response.status, 401);
        assert.equal(response.body.code, 'AUTH401_01');
    }
});

test('sync records consent for the authenticated user only', async () => {
    const { api, prisma } = fixture();
    const rejected = await api.post('/api/v1/closets/sync').set('x-test-user-id', '7').send({ platform: 'MUSINSA', is_agreed: false, userId: 8 });
    assert.equal(rejected.status, 400);
    assert.equal(prisma.state.consents.length, 0);
    const saved = await api.post('/api/v1/closets/sync').set('x-test-user-id', '7').send({ platform: 'MUSINSA', is_agreed: true, userId: 8 });
    assert.equal(saved.status, 200);
    assert.equal(prisma.state.consents[0].userId, 7);
    assert.equal(prisma.state.sessions[0].userId, 7);
    assert.equal(saved.body.result.status, 'REQUESTED');
});

test('register validates owned active closet image, ignores body userId, and lists only its owner', async () => {
    const { api } = fixture();
    for (const tags of [undefined, []]) {
        const response = await api.post('/api/v1/closets/items')
            .set('x-test-user-id', '7')
            .send({ ...validItem, tags });
        assert.equal(response.status, 400);
        assert.equal(response.body.code, 'CLOSET4002');
    }
    const created = await api.post('/api/v1/closets/items').set('x-test-user-id', '7').send({ ...validItem, userId: 8 });
    assert.equal(created.status, 201);
    assert.deepEqual(created.body.result.tags, ['여름', '흰색']);
    assert.equal(created.body.result.imageId, 10);
    assert.equal(created.body.result.brand, 'Fitty');
    assert.equal(created.body.result.colorText, '화이트');
    assert.equal(created.body.result.subCategory, '옥스퍼드 셔츠');
    assert.equal(created.body.result.memo, '봄 코디용');
    assert.match(created.body.result.image_url, /^\/api\/v1\/images\/10\/content\?expires=\d+&signature=[a-f0-9]{64}$/);
    const foreignList = await api.get('/api/v1/closets/items?userId=7').set('x-test-user-id', '8');
    assert.deepEqual(foreignList.body.result, { category_count: {}, closet_items: [] });
    for (const imageId of [11, 12, 13, 999]) {
        const response = await api.post('/api/v1/closets/items').set('x-test-user-id', '7').send({ ...validItem, imageId });
        assert.equal(response.status, 404);
    }
});

test('create and tag update are transactional, and CRUD is owner scoped', async () => {
    const { api, prisma } = fixture();
    prisma.failTagCreate = true;
    const failed = await api.post('/api/v1/closets/items').set('x-test-user-id', '7').send(validItem);
    assert.equal(failed.status, 500);
    assert.equal(prisma.state.items.length, 0);
    prisma.failTagCreate = false;
    const made = await api.post('/api/v1/closets/items').set('x-test-user-id', '7').send(validItem);
    const itemId = made.body.result.item_id;
    const foreignGet = await api.get(`/api/v1/closets/items/${itemId}`).set('x-test-user-id', '8');
    assert.equal(foreignGet.status, 404);
    const changed = await api.patch(`/api/v1/closets/items/${itemId}`).set('x-test-user-id', '7').send({
        tags: ['가을'],
        brand: '수정 브랜드',
        colorText: null,
        subCategory: '긴팔 셔츠',
        memo: '수정 메모',
        userId: 8,
        imageId: 11
    });
    assert.equal(changed.status, 200);
    assert.deepEqual(changed.body.result.tags, ['가을']);
    assert.equal(changed.body.result.brand, '수정 브랜드');
    assert.equal(changed.body.result.colorText, null);
    assert.equal(changed.body.result.subCategory, '긴팔 셔츠');
    assert.equal(changed.body.result.memo, '수정 메모');
    assert.match(changed.body.result.image_url, /^\/api\/v1\/images\/10\/content\?expires=\d+&signature=[a-f0-9]{64}$/);
    const foreignDelete = await api.delete(`/api/v1/closets/items/${itemId}`).set('x-test-user-id', '8');
    assert.equal(foreignDelete.status, 404);
    const deleted = await api.delete(`/api/v1/closets/items/${itemId}`).set('x-test-user-id', '7');
    assert.equal(deleted.status, 200);
    assert.equal((await api.get(`/api/v1/closets/items/${itemId}`).set('x-test-user-id', '7')).status, 404);
});
