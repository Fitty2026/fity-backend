import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OutfitService } from '../src/services/outfit.service.js';
import { OutfitAiAdapter } from '../src/services/outfit-ai.service.js';
import { createApp } from '../src/app.js';
import request from 'supertest';
import jwt from 'jsonwebtoken';

class MemoryOutfitRepository {
    constructor() { this.jobs = []; this.results = []; this.saved = []; this.next = 1; this.ownedClosetItems = new Map([[1, new Set([4])]]); }
    async createJob(data) { const job = { id: this.next++, status: 'QUEUED', createdAt: new Date(), completedAt: null, failureCode: null, failureReason: null, result: null, ...data }; this.jobs.push(job); return job; }
    async findOwnedClosetItemIds(userId, ids) { return ids.filter((id) => this.ownedClosetItems.get(userId)?.has(id)); }
    async findOwnedActiveBodyProfile() { return null; }
    async findJob(userId, id) { const job = this.jobs.find((item) => item.id === id && item.userId === userId); return job && { ...job, result: this.results.find((r) => r.generationJobId === job.id) || null }; }
    async claimQueuedJob(id) { const job = this.jobs.find((item) => item.id === id && item.status === 'QUEUED'); if (!job) return null; job.status = 'PROCESSING'; job.startedAt = new Date(); return { ...job }; }
    async completeJob({ job, aiResult }) { const result = { id: this.next++, userId: job.userId, generationJobId: job.id, createdAt: new Date(), ...aiResult }; this.results.push(result); const target = this.jobs.find((item) => item.id === job.id); target.status = 'COMPLETED'; target.completedAt = new Date(); return result; }
    async failJob({ id, code, reason }) { const job = this.jobs.find((item) => item.id === id); job.status = 'FAILED'; job.failureCode = code; job.failureReason = reason; job.completedAt = new Date(); return { count: 1 }; }
    async findResult(userId, id) { return this.results.find((item) => item.id === id && item.userId === userId) || null; }
    async saveResult({ userId, outfitResultId, name }) { if (this.saved.some((item) => item.userId === userId && item.outfitResultId === outfitResultId)) { const error = new Error('duplicate'); error.code = 'P2002'; throw error; } const saved = { id: this.next++, userId, outfitResultId, name, createdAt: new Date(), outfitResult: this.results.find((r) => r.id === outfitResultId) }; this.saved.push(saved); return saved; }
    async listSaved(userId, skip, take) { const rows = this.saved.filter((item) => item.userId === userId).map((item) => ({ ...item, outfitResult: this.results.find((r) => r.id === item.outfitResultId) })); return [rows.slice(skip, skip + take), rows.length]; }
    async deleteSaved(userId, id) { const index = this.saved.findIndex((item) => item.id === id && item.userId === userId); if (index < 0) return { count: 0 }; this.saved.splice(index, 1); return { count: 1 }; }
}

const readyAdapter = { generate: async () => ({ generatedImageUrl: 'https://ai.example/outfit.png', provider: 'test-ai', fallbackUsed: false, recommendedClosetItemIds: [4] }) };

describe('OutfitService', () => {
    it('does not mutate a queued job while it is polled', async () => {
        const service = new OutfitService({ repository: new MemoryOutfitRepository(), aiAdapter: readyAdapter });
        const created = await service.createGenerationJob(1, { closetItemIds: [4], styleTagIds: [2] });
        const polled = await service.getGenerationJob(1, created.jobId);
        assert.equal(polled.status, 'queued');
        assert.equal(polled.generatedImage, null);
    });
    it('rejects a generation request that includes another user\'s closet item', async () => {
        const service = new OutfitService({ repository: new MemoryOutfitRepository(), aiAdapter: readyAdapter });
        await assert.rejects(() => service.createGenerationJob(1, { closetItemIds: [4, 99] }), { code: 'FORBIDDEN403' });
    });
    it('records adapter failures as a terminal failed state', async () => {
        const repository = new MemoryOutfitRepository();
        const service = new OutfitService({ repository, aiAdapter: { generate: async () => { const error = new Error('timeout'); error.code = 'AI_TIMEOUT'; throw error; } } });
        const created = await service.createGenerationJob(1, { closetItemIds: [4] });
        await service.processGenerationJob(created.jobId);
        const result = await service.getGenerationJob(1, created.jobId);
        assert.equal(result.status, 'failed'); assert.equal(result.failure.code, 'AI_TIMEOUT');
    });
    it('scopes saved outfit lifecycle to its owner', async () => {
        const repository = new MemoryOutfitRepository(); const service = new OutfitService({ repository, aiAdapter: readyAdapter });
        const created = await service.createGenerationJob(1, { closetItemIds: [4] }); await service.processGenerationJob(created.jobId);
        const resultId = (await service.getGenerationJob(1, created.jobId)).outfitResultId;
        const saved = await service.saveOutfit(1, { outfitResultId: resultId, name: 'daily' });
        await assert.rejects(() => service.deleteSavedOutfit(2, saved.id), { code: 'NOT_FOUND404' });
        assert.equal((await service.getSavedOutfits(1, {})).pagination.totalCount, 1);
    });
    for (const [name, adapter] of [
        ['timeout', { generate: async () => { const error = new Error('timeout'); error.code = 'AI_TIMEOUT'; throw error; } }],
        ['rejection', { generate: async () => { const error = new Error('unavailable'); error.code = 'AI_UNAVAILABLE'; throw error; } }],
        ['foreign recommendation', { generate: async () => ({ generatedImageUrl: 'https://ai.example/outfit.png', provider: 'test-ai', fallbackUsed: false, recommendedClosetItemIds: [99] }) }]
    ]) it(`never leaves a job processing after ${name}`, async () => {
        const repository = new MemoryOutfitRepository(); const service = new OutfitService({ repository, aiAdapter: adapter });
        const created = await service.createGenerationJob(1, { closetItemIds: [4] }); await service.processGenerationJob(created.jobId);
        const job = await service.getGenerationJob(1, created.jobId);
        assert.equal(job.status, 'failed');
    });
});

describe('OutfitAiAdapter', () => {
    it('rejects malformed adapter responses', async () => {
        const adapter = new OutfitAiAdapter({ endpoint: 'http://ai.internal', fetchImpl: async () => new Response(JSON.stringify({ generatedImageUrl: 'bad' }), { status: 200 }) });
        await assert.rejects(() => adapter.generate({ jobId: 1, userId: 1, closetItemIds: [], styleTagIds: [] }), { code: 'AI_INVALID_RESPONSE' });
    });
    it('maps adapter rejection and timeout to stable errors', async () => {
        const rejected = new OutfitAiAdapter({ endpoint: 'http://ai.internal', fetchImpl: async () => { throw new Error('network'); } });
        await assert.rejects(() => rejected.generate({ jobId: 1, userId: 1, closetItemIds: [], styleTagIds: [] }));
        const timedOut = new OutfitAiAdapter({ endpoint: 'http://ai.internal', timeoutMs: 5, fetchImpl: (_, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))) });
        await assert.rejects(() => timedOut.generate({ jobId: 1, userId: 1, closetItemIds: [], styleTagIds: [] }), { code: 'AI_TIMEOUT' });
    });
});

describe('Outfit HTTP auth boundary', () => {
    it('uses the JWT subject for outfit creation and rejects unauthenticated requests', async () => {
        const repository = new MemoryOutfitRepository();
        const app = createApp({ outfitService: new OutfitService({ repository, aiAdapter: readyAdapter }), healthCheck: async () => {} });
        const oldSecret = process.env.JWT_ACCESS_SECRET;
        process.env.JWT_ACCESS_SECRET = 'a-long-test-secret-that-is-at-least-32-chars';
        try {
            const api = request(app);
            const denied = await api.post('/api/v1/outfits/generation-jobs').send({ closetItemIds: [4] });
            assert.equal(denied.status, 401);
            const token = jwt.sign({ sub: '1' }, process.env.JWT_ACCESS_SECRET, { algorithm: 'HS256' });
            const created = await api.post('/api/v1/outfits/generation-jobs').set('authorization', `Bearer ${token}`).send({ closetItemIds: [4], userId: 2 });
            assert.equal(created.status, 200);
            assert.equal(repository.jobs[0].userId, 1);
        } finally {
            if (oldSecret === undefined) delete process.env.JWT_ACCESS_SECRET; else process.env.JWT_ACCESS_SECRET = oldSecret;
        }
    });
});
