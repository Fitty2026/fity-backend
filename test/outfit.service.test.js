import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OutfitService } from '../src/services/outfit.service.js';
import { OutfitAiAdapter } from '../src/services/outfit-ai.service.js';
import { OutfitRepository } from '../src/repositories/outfit.repository.js';
import { createApp } from '../src/app.js';
import request from 'supertest';
import jwt from 'jsonwebtoken';

class MemoryOutfitRepository {
    constructor() {
        this.jobs = []; this.results = []; this.saved = []; this.revisions = []; this.next = 1;
        this.items = new Map([[1, [
            { id: 4, imageId: 14, name: 'shirt', size: 'M', category: 'TOP', importType: 'MANUAL', tags: [{ tagName: 'white' }], imageAsset: { id: 14, mimeType: 'image/png' } },
            { id: 5, imageId: 15, name: 'jacket', size: 'M', category: 'TOP', importType: 'MANUAL', tags: [{ tagName: 'navy' }], imageAsset: { id: 15, mimeType: 'image/png' } },
            { id: 6, imageId: 16, name: 'pants', size: 'M', category: 'BOTTOM', importType: 'MANUAL', tags: [{ tagName: 'black' }], imageAsset: { id: 16, mimeType: 'image/png' } },
            { id: 7, imageId: 17, name: 'shoes', size: 'M', category: 'SHOES', importType: 'MANUAL', tags: [{ tagName: 'black' }], imageAsset: { id: 17, mimeType: 'image/png' } }
        ]]]);
        this.bodyProfiles = new Map([[1, { id: 7, bodyBalance: 'BALANCED', shoulderWidth: 'AVERAGE', frameSize: 'MEDIUM' }]]);
        this.styleTags = new Map([[1, new Set([2])]]);
    }
    async createOrFindActiveJob(data, now = new Date()) {
        const active = this.jobs.find((job) => job.userId === data.userId && ['QUEUED', 'PROCESSING', 'QC_PENDING'].includes(job.status) && job.expiresAt > now);
        if (active) return { job: active, isExistingJob: true };
        const job = { id: this.next++, status: 'QUEUED', createdAt: new Date(now), completedAt: null, failureCode: null, failureReason: null, result: null, ...data };
        this.jobs.push(job); return { job, isExistingJob: false };
    }
    async createRevisionJob({ revision, job }) { const created = (await this.createOrFindActiveJob(job)).job; const saved = { id: this.next++, ...revision, generationJobId: created.id }; this.revisions.push(saved); return { job: created, revision: saved }; }
    async findOwnedClosetItems(userId, ids) { return (this.items.get(userId) || []).filter((item) => ids.includes(item.id)); }
    async findOwnedClosetItemIds(userId, ids) { return (await this.findOwnedClosetItems(userId, ids)).map((item) => item.id); }
    async findOwnedStyleTagIds(userId, ids) {
        const owned = [...(this.styleTags.get(userId) || [])];
        return ids ? ids.filter((id) => owned.includes(id)) : owned;
    }
    async findGenerationContext(userId, selectedItemIds, styleTagIds) {
        const pool = this.items.get(userId) || [];
        return {
            bodyProfile: this.bodyProfiles.get(userId) || null,
            selectedItems: pool.filter((item) => selectedItemIds.includes(item.id)),
            closetItemPool: pool,
            stylePreferences: styleTagIds
                .filter((id) => this.styleTags.get(userId)?.has(id))
                .map((id) => ({ id, code: `STYLE_${id}`, name: `Style ${id}` }))
        };
    }
    async findActiveBodyProfile(userId) { return this.bodyProfiles.get(userId) || null; }
    async findJob(userId, id) { const job = this.jobs.find((item) => item.id === id && item.userId === userId); const result = this.results.find((r) => r.generationJobId === job?.id); return job && { ...job, revision: this.revisions.find((r) => r.generationJobId === job.id) || null, result: result ? { ...result, savedOutfits: this.saved.filter((s) => s.outfitResultId === result.id) } : null }; }
    async findJobByIdempotencyKey(userId, idempotencyKey) { const job = this.jobs.find((item) => item.userId === userId && item.idempotencyKey === idempotencyKey); return job ? this.findJob(userId, job.id) : null; }
    async findActiveJob(userId, now = new Date()) { return this.jobs.find((job) => job.userId === userId && ['QUEUED', 'PROCESSING', 'QC_PENDING'].includes(job.status) && job.expiresAt > now) || null; }
    async findLatestResumableJob(userId, completedAfter) {
        const job = this.jobs
            .filter((job) => job.userId === userId && job.status === 'COMPLETED' && job.completedAt > completedAfter)
            .sort((left, right) => right.completedAt - left.completedAt)[0] || null;
        return job ? this.findJob(userId, job.id) : null;
    }
    async listQueuedJobIds(limit = 5, now = new Date()) { return this.jobs.filter((job) => job.status === 'QUEUED' && job.expiresAt > now).slice(0, limit).map((job) => job.id); }
    async expireStaleActiveJobs(userId, now = new Date()) { let count = 0; for (const job of this.jobs) if (job.userId === userId && ['QUEUED', 'PROCESSING', 'QC_PENDING'].includes(job.status) && job.expiresAt <= now) { job.status = 'EXPIRED'; job.failureCode = 'JOB_TIMEOUT'; job.failureReason = 'Outfit generation job expired.'; job.completedAt = now; count++; } return { count }; }
    async expireCompletedJob(id) { const job = this.jobs.find((item) => item.id === id && item.status === 'COMPLETED'); if (!job) return { count: 0 }; job.status = 'EXPIRED'; job.failureCode = 'RESULT_EXPIRED'; job.failureReason = 'Unsaved outfit result expired.'; return { count: 1 }; }
    async expireAllStaleActiveJobs(now = new Date()) { let count = 0; for (const job of this.jobs) if (['QUEUED', 'PROCESSING', 'QC_PENDING'].includes(job.status) && job.expiresAt <= now) { job.status = 'EXPIRED'; job.failureCode = 'JOB_TIMEOUT'; job.failureReason = 'Outfit generation job expired.'; job.completedAt = now; count++; } return { count }; }
    async expireAllCompletedJobs(cutoff) { let count = 0; for (const job of this.jobs) { const result = this.results.find((item) => item.generationJobId === job.id); const saved = result && this.saved.some((item) => item.outfitResultId === result.id); if (job.status === 'COMPLETED' && job.completedAt <= cutoff && !saved) { job.status = 'EXPIRED'; job.failureCode = 'RESULT_EXPIRED'; job.failureReason = 'Unsaved outfit result expired.'; count++; } } return { count }; }
    async purgeDeletedSavedOutfits(deletedBefore) { const before = this.saved.length; this.saved = this.saved.filter((item) => !item.deletedAt || item.deletedAt > deletedBefore); return { count: before - this.saved.length }; }
    async claimQueuedJob(id, now = new Date()) { const job = this.jobs.find((item) => item.id === id && item.status === 'QUEUED' && item.expiresAt > now); if (!job) return null; job.status = 'PROCESSING'; job.progress = 70; job.startedAt = now; return { ...job }; }
    async markQcPending(id) { const job = this.jobs.find((item) => item.id === id && item.status === 'PROCESSING'); if (!job) return { count: 0 }; job.status = 'QC_PENDING'; job.progress = 90; return { count: 1 }; }
    async completeJob({ job, aiResult }) { const result = { id: this.next++, userId: job.userId, generationJobId: job.id, createdAt: new Date(), ...aiResult }; this.results.push(result); const target = this.jobs.find((item) => item.id === job.id); target.status = 'COMPLETED'; target.progress = 100; target.completedAt = new Date(); return result; }
    async failJob({ id, code, reason }) { const job = this.jobs.find((item) => item.id === id); job.status = 'FAILED'; job.failureCode = code; job.failureReason = reason; job.completedAt = new Date(); return { count: 1 }; }
    async findResult(userId, id) { const result = this.results.find((item) => item.id === id && item.userId === userId); return result ? { ...result, generationJob: this.jobs.find((job) => job.id === result.generationJobId) } : null; }
    async saveResult({ userId, outfitResultId, name, tags, memo }) { if (this.saved.some((item) => item.userId === userId && item.outfitResultId === outfitResultId)) { const error = new Error('duplicate'); error.code = 'P2002'; throw error; } const now = new Date(); const saved = { id: this.next++, userId, outfitResultId, name, tags, memo, createdAt: now, updatedAt: now, deletedAt: null, outfitResult: await this.findResult(userId, outfitResultId) }; this.saved.push(saved); return saved; }
    async listSaved(userId, skip, take, deleted = false) { const rows = this.saved.filter((item) => item.userId === userId && (deleted ? Boolean(item.deletedAt) : !item.deletedAt)).map((item) => ({ ...item, outfitResult: this.results.find((r) => r.id === item.outfitResultId) })); return [rows.slice(skip, skip + take), rows.length]; }
    async findSaved(userId, id) { return this.saved.find((item) => item.id === id && item.userId === userId && !item.deletedAt) || null; }
    async updateSaved(userId, id, data) { const item = await this.findSaved(userId, id); if (!item) return null; Object.assign(item, data, { updatedAt: new Date() }); return item; }
    async softDeleteSaved(userId, id, deletedAt = new Date()) { const item = this.saved.find((saved) => saved.id === id && saved.userId === userId && !saved.deletedAt); if (!item) return { count: 0 }; item.deletedAt = deletedAt; return { count: 1 }; }
    async restoreSaved(userId, id, deletedAfter) { const item = this.saved.find((saved) => saved.id === id && saved.userId === userId && saved.deletedAt && saved.deletedAt > deletedAfter); if (!item) return { count: 0 }; item.deletedAt = null; return { count: 1 }; }
    async permanentDeleteSaved(userId, id) { const index = this.saved.findIndex((saved) => saved.id === id && saved.userId === userId && saved.deletedAt); if (index < 0) return { count: 0 }; this.saved.splice(index, 1); return { count: 1 }; }
}

const readyAdapter = { generate: async () => ({ generatedImageUrl: 'https://ai.example/outfit.png', provider: 'test-ai', modelVersion: 'test-v1', promptVersion: 'prompt-v1', fallbackUsed: false, recommendedClosetItemIds: [4] }) };

describe('OutfitService', () => {
    it('does not mutate a queued job while it is polled', async () => {
        const service = new OutfitService({ repository: new MemoryOutfitRepository(), aiAdapter: readyAdapter });
        const created = await service.createGenerationJob(1, { closetItemIds: [4], styleTagIds: [2] });
        const polled = await service.getGenerationJob(1, created.jobId);
        assert.equal(polled.status, 'queued');
        assert.equal(polled.generatedImageUrl, null);
        assert.equal(polled.generatedImage, null);
    });
    it('rejects a generation request that includes another user\'s closet item', async () => {
        const service = new OutfitService({ repository: new MemoryOutfitRepository(), aiAdapter: readyAdapter });
        await assert.rejects(() => service.createGenerationJob(1, { closetItemIds: [4, 99] }), { code: 'FORBIDDEN403' });
    });
    it('uses the authenticated user body profile and ignores a bodyProfileId payload', async () => {
        const repository = new MemoryOutfitRepository();
        const service = new OutfitService({ repository, aiAdapter: readyAdapter });
        await service.createGenerationJob(1, { closetItemIds: [4], bodyProfileId: 999 });
        assert.equal(repository.jobs[0].bodyProfileId, 7);
    });
    it('requires the authenticated user active body profile', async () => {
        const repository = new MemoryOutfitRepository();
        repository.bodyProfiles.clear();
        const service = new OutfitService({ repository, aiAdapter: readyAdapter });
        await assert.rejects(() => service.createGenerationJob(1, { closetItemIds: [4] }), { code: 'NOT_FOUND404' });
    });
    it('stores recommendation context and returns the existing active job', async () => {
        const repository = new MemoryOutfitRepository();
        const service = new OutfitService({ repository, aiAdapter: readyAdapter });
        const first = await service.createGenerationJob(1, {
            closetItemIds: [4], styleTagIds: [2], situation: 'DATE', selectedDate: '2026-07-29',
            weather: { temperature: 28, condition: 'SUNNY' }
        });
        const second = await service.createGenerationJob(1, { closetItemIds: [5] });
        assert.equal(first.isExistingJob, false);
        assert.equal(second.isExistingJob, true);
        assert.equal(second.jobId, first.jobId);
        assert.deepEqual(second.input, first.input);
        assert.equal(repository.jobs.length, 1);
        assert.equal(repository.jobs[0].inputSnapshot.bodyProfile.bodyBalance, 'BALANCED');
        assert.deepEqual(repository.jobs[0].inputSnapshot.selectedItems.map((item) => item.itemId), [4]);
        assert.deepEqual(repository.jobs[0].inputSnapshot.closetItemPool.map((item) => item.itemId), [4, 5, 6, 7]);
        assert.equal(repository.jobs[0].inputSnapshot.selectedItems[0].imageRef.contentPath, '/api/v1/images/14/content');
    });
    it('uses stored style preferences when styleTagIds is omitted', async () => {
        const repository = new MemoryOutfitRepository();
        const service = new OutfitService({ repository, aiAdapter: readyAdapter });
        const created = await service.createGenerationJob(1, { closetItemIds: [4] });
        assert.deepEqual(created.input.styleTagIds, [2]);
        assert.deepEqual(repository.jobs[0].inputSnapshot.stylePreferences, [
            { styleTagId: 2, code: 'STYLE_2', name: 'Style 2' }
        ]);
    });
    it('reuses an Idempotency-Key only for the same generation request', async () => {
        const repository = new MemoryOutfitRepository();
        const service = new OutfitService({ repository, aiAdapter: readyAdapter });
        const first = await service.createGenerationJob(1, { closetItemIds: [4], situation: 'DATE' }, 'generation-1');
        const retry = await service.createGenerationJob(1, { closetItemIds: [4], situation: 'DATE' }, 'generation-1');
        assert.equal(retry.jobId, first.jobId);
        assert.equal(retry.isExistingJob, true);
        assert.equal(retry.inputSchemaVersion, 'outfit-input-v1');
        assert.equal(repository.jobs.length, 1);
        await assert.rejects(
            () => service.createGenerationJob(1, { closetItemIds: [5], situation: 'DATE' }, 'generation-1'),
            { code: 'CONFLICT409' }
        );
    });
    it('treats reordered ID arrays as the same idempotent generation request', async () => {
        const repository = new MemoryOutfitRepository();
        const service = new OutfitService({ repository, aiAdapter: readyAdapter });
        const first = await service.createGenerationJob(1, { closetItemIds: [4, 6], styleTagIds: [2] }, 'generation-order');
        const retry = await service.createGenerationJob(1, { closetItemIds: [6, 4], styleTagIds: [2] }, 'generation-order');
        assert.equal(retry.jobId, first.jobId);
        assert.equal(retry.isExistingJob, true);
    });
    it('returns CONFLICT409 when a concurrent generation request claims the same key with different input', async () => {
        const repository = new MemoryOutfitRepository();
        repository.createOrFindActiveJob = async (data, now) => {
            repository.jobs.push({
                id: repository.next++, status: 'QUEUED', createdAt: new Date(now), completedAt: null,
                failureCode: null, failureReason: null, result: null, ...data, closetItemIds: [5]
            });
            const error = new Error('duplicate idempotency key'); error.code = 'P2002'; throw error;
        };
        const service = new OutfitService({ repository, aiAdapter: readyAdapter });
        await assert.rejects(
            () => service.createGenerationJob(1, { closetItemIds: [4] }, 'generation-race'),
            { status: 409, code: 'CONFLICT409' }
        );
    });
    it('validates situation, date, and weather values', async () => {
        const service = new OutfitService({ repository: new MemoryOutfitRepository(), aiAdapter: readyAdapter });
        await assert.rejects(() => service.createGenerationJob(1, { closetItemIds: [4, 5, 6, 7] }), { code: 'REQUEST400' });
        await assert.rejects(() => service.createGenerationJob(1, { closetItemIds: [4], situation: 'PARTY' }), { code: 'REQUEST400' });
        await assert.rejects(() => service.createGenerationJob(1, { closetItemIds: [4], selectedDate: '2026-02-30' }), { code: 'REQUEST400' });
        await assert.rejects(() => service.createGenerationJob(1, { closetItemIds: [4], weather: { condition: 'CLOUDLY' } }), { code: 'REQUEST400' });
        const windy = await service.createGenerationJob(1, {
            closetItemIds: [4], selectedDate: '1999-12-31', weather: { condition: 'WINDY' }
        });
        assert.equal(windy.input.weather.condition, 'WINDY');
        assert.equal(windy.input.weather.temperature, undefined);
        assert.equal(windy.input.selectedDate, '1999-12-31');
    });
    it('accepts exactly three closet items', async () => {
        const service = new OutfitService({ repository: new MemoryOutfitRepository(), aiAdapter: readyAdapter });
        const created = await service.createGenerationJob(1, { closetItemIds: [4, 6, 7] });
        assert.deepEqual(created.input.closetItemIds, [4, 6, 7]);
    });
    it('allows one item per core clothing category only', async () => {
        const service = new OutfitService({ repository: new MemoryOutfitRepository(), aiAdapter: readyAdapter });
        await assert.rejects(
            () => service.createGenerationJob(1, { closetItemIds: [4, 5] }),
            { code: 'REQUEST400' }
        );
        const created = await service.createGenerationJob(1, { closetItemIds: [4, 6, 7] });
        assert.deepEqual(created.input.closetItemIds, [4, 6, 7]);
    });
    it('expires a stalled active job after ten minutes', async () => {
        const repository = new MemoryOutfitRepository();
        let now = new Date('2026-07-29T12:00:00.000Z');
        const service = new OutfitService({ repository, aiAdapter: readyAdapter, now: () => now });
        const created = await service.createGenerationJob(1, { closetItemIds: [4] });
        now = new Date('2026-07-29T12:10:01.000Z');
        const job = await service.getGenerationJob(1, created.jobId);
        assert.equal(job.status, 'expired');
        assert.equal(job.failure.code, 'JOB_TIMEOUT');
        assert.equal(await service.getActiveGenerationJob(1), null);
    });
    it('returns the latest valid completed job for loading-page resume', async () => {
        const repository = new MemoryOutfitRepository();
        const service = new OutfitService({ repository, aiAdapter: readyAdapter });
        const created = await service.createGenerationJob(1, { closetItemIds: [4] });
        await service.processGenerationJob(created.jobId);

        const resumed = await service.getActiveGenerationJob(1);

        assert.equal(resumed.jobId, created.jobId);
        assert.equal(resumed.status, 'completed');
        assert.equal(resumed.outfitResultId, 2);
        assert.equal(resumed.generatedImageUrl, 'https://ai.example/outfit.png');
    });
    it('completes with the static fallback when the adapter fails', async () => {
        const repository = new MemoryOutfitRepository();
        const service = new OutfitService({ repository, aiAdapter: { generate: async () => { const error = new Error('timeout'); error.code = 'AI_TIMEOUT'; throw error; } } });
        const created = await service.createGenerationJob(1, { closetItemIds: [4] });
        await service.processGenerationJob(created.jobId);
        const result = await service.getGenerationJob(1, created.jobId);
        assert.equal(result.status, 'completed');
        assert.equal(result.generatedImageUrl, '/fallback/mock-outfit-preview.jpg');
        assert.equal(result.generatedImageUrl, result.generatedImage.imageUrl);
        assert.deepEqual(result.generatedImage, {
            outfitResultId: 2,
            imageUrl: '/fallback/mock-outfit-preview.jpg',
            provider: 'fitty-fallback',
            modelVersion: 'fallback-v1',
            promptVersion: null,
            fallbackUsed: true,
            outfitItems: null,
            recommendedClosetItemIds: [4]
        });
        assert.equal(result.failure, null);
    });
    it('returns a browser-loadable signed URL for stored generated images', async () => {
        const repository = new MemoryOutfitRepository();
        const service = new OutfitService({
            repository,
            aiAdapter: {
                generate: async () => ({
                    generatedImageUrl: '/api/v1/images/99/content',
                    provider: 'test-ai',
                    modelVersion: 'test-v1',
                    fallbackUsed: false,
                    recommendedClosetItemIds: [4]
                })
            },
            imageUrlSigner: {
                createSignedUrl: (imageId) => `/api/v1/images/${imageId}/content?expires=123&signature=signed`
            }
        });
        const created = await service.createGenerationJob(1, { closetItemIds: [4] });
        await service.processGenerationJob(created.jobId);
        const result = await service.getGenerationJob(1, created.jobId);
        assert.equal(result.generatedImageUrl, '/api/v1/images/99/content?expires=123&signature=signed');
        assert.equal(result.generatedImage.imageUrl, result.generatedImageUrl);
    });
    it('completes with fallback when the AI adapter is not configured', async () => {
        const repository = new MemoryOutfitRepository();
        const service = new OutfitService({ repository, aiAdapter: new OutfitAiAdapter({ endpoint: undefined }) });
        const created = await service.createGenerationJob(1, { closetItemIds: [4] });
        await service.processGenerationJob(created.jobId);
        const result = await service.getGenerationJob(1, created.jobId);
        assert.equal(result.status, 'completed');
        assert.equal(result.generatedImage.fallbackUsed, true);
        assert.equal(result.generatedImage.imageUrl, '/fallback/mock-outfit-preview.jpg');
    });
    it('scopes saved outfit lifecycle to its owner', async () => {
        const repository = new MemoryOutfitRepository(); const service = new OutfitService({ repository, aiAdapter: readyAdapter });
        const created = await service.createGenerationJob(1, { closetItemIds: [4] }); await service.processGenerationJob(created.jobId);
        const resultId = (await service.getGenerationJob(1, created.jobId)).outfitResultId;
        const saved = await service.saveOutfit(1, { outfitResultId: resultId, name: 'daily' });
        await assert.rejects(() => service.deleteSavedOutfit(2, saved.id), { code: 'NOT_FOUND404' });
        assert.equal((await service.getSavedOutfits(1, {})).pagination.totalCount, 1);
    });
    it('recovers queued jobs through the database polling boundary', async () => {
        const repository = new MemoryOutfitRepository();
        const service = new OutfitService({ repository, aiAdapter: readyAdapter });
        await service.createGenerationJob(1, { closetItemIds: [4] });
        const summary = await service.processPendingJobs(5);
        assert.deepEqual(summary, { scanned: 1, processed: 1, failed: 0 });
        assert.equal(repository.jobs[0].status, 'COMPLETED');
    });
    it('soft deletes, lists, restores, and permanently deletes a saved outfit', async () => {
        const repository = new MemoryOutfitRepository(); const service = new OutfitService({ repository, aiAdapter: readyAdapter });
        const created = await service.createGenerationJob(1, { closetItemIds: [4] }); await service.processGenerationJob(created.jobId);
        const resultId = (await service.getGenerationJob(1, created.jobId)).outfitResultId;
        const saved = await service.saveOutfit(1, { outfitResultId: resultId, name: 'daily', tags: ['date'], memo: 'memo' });
        assert.deepEqual(saved.items, [4]);
        const deleted = await service.deleteSavedOutfit(1, saved.id);
        assert.equal(deleted.savedOutfitId, saved.id);
        assert.ok(deleted.deletedAt instanceof Date);
        assert.equal((await service.getSavedOutfits(1, {})).pagination.totalCount, 0);
        const deletedList = await service.getDeletedSavedOutfits(1, {});
        assert.equal(deletedList.pagination.totalCount, 1);
        assert.equal(deletedList.items[0].deletionDaysRemaining, 30);
        const restored = await service.restoreSavedOutfit(1, saved.id);
        assert.equal(restored.deletedAt, null);
        assert.ok(restored.restoredAt instanceof Date);
        assert.equal((await service.getSavedOutfits(1, {})).pagination.totalCount, 1);
        await service.deleteSavedOutfit(1, saved.id);
        await service.permanentlyDeleteSavedOutfit(1, saved.id);
        assert.equal((await service.getDeletedSavedOutfits(1, {})).pagination.totalCount, 0);
    });
    it('reads and updates saved outfit details for its owner only', async () => {
        const repository = new MemoryOutfitRepository(); const service = new OutfitService({ repository, aiAdapter: readyAdapter });
        const created = await service.createGenerationJob(1, { closetItemIds: [4] }); await service.processGenerationJob(created.jobId);
        const resultId = (await service.getGenerationJob(1, created.jobId)).outfitResultId;
        const saved = await service.saveOutfit(1, { outfitResultId: resultId, name: 'before' });
        const updated = await service.updateSavedOutfit(1, saved.id, { name: 'after', tags: ['work'], memo: 'updated' });
        assert.equal(updated.name, 'after');
        assert.deepEqual((await service.getSavedOutfit(1, saved.id)).tags, ['work']);
        await assert.rejects(() => service.getSavedOutfit(2, saved.id), { code: 'NOT_FOUND404' });
    });
    it('enforces saved outfit name, tag, and memo limits from the API contract', async () => {
        const repository = new MemoryOutfitRepository(); const service = new OutfitService({ repository, aiAdapter: readyAdapter });
        const created = await service.createGenerationJob(1, { closetItemIds: [4] }); await service.processGenerationJob(created.jobId);
        const resultId = (await service.getGenerationJob(1, created.jobId)).outfitResultId;
        await assert.rejects(() => service.saveOutfit(1, { outfitResultId: resultId, name: 'x'.repeat(21) }), { code: 'REQUEST400' });
        await assert.rejects(() => service.saveOutfit(1, { outfitResultId: resultId, tags: ['1', '2', '3', '4', '5', '6'] }), { code: 'REQUEST400' });
        await assert.rejects(() => service.saveOutfit(1, { outfitResultId: resultId, memo: 'x'.repeat(201) }), { code: 'REQUEST400' });
    });
    it('does not save or revise an unsaved result after its 24-hour retention window', async () => {
        const repository = new MemoryOutfitRepository();
        let now = new Date('2026-07-29T12:00:00.000Z');
        const service = new OutfitService({ repository, aiAdapter: readyAdapter, now: () => now });
        const created = await service.createGenerationJob(1, { closetItemIds: [4] });
        await service.processGenerationJob(created.jobId);
        const job = repository.jobs.find((item) => item.id === created.jobId);
        job.completedAt = new Date(now);
        const resultId = (await service.getGenerationJob(1, created.jobId)).outfitResultId;
        now = new Date('2026-07-30T12:00:01.000Z');
        await assert.rejects(() => service.saveOutfit(1, { outfitResultId: resultId }), { code: 'NOT_FOUND404' });
        await assert.rejects(() => service.createRevision(1, resultId, { replaceItemId: 4, newItemId: 5 }), { code: 'NOT_FOUND404' });
    });
    it('creates a revision only with an owned item in the same category', async () => {
        const repository = new MemoryOutfitRepository(); const service = new OutfitService({ repository, aiAdapter: readyAdapter });
        const created = await service.createGenerationJob(1, { closetItemIds: [4] }); await service.processGenerationJob(created.jobId);
        const resultId = (await service.getGenerationJob(1, created.jobId)).outfitResultId;
        const revision = await service.createRevision(1, resultId, { replaceItemId: 4, newItemId: 5 });
        assert.equal(revision.revisionId, 4);
        assert.equal(revision.parentOutfitResultId, resultId);
        const revisionJob = repository.jobs.find((job) => job.id === revision.jobId);
        assert.deepEqual(revisionJob.closetItemIds, [5]);
        assert.deepEqual(revisionJob.inputSnapshot.selectedItems.map((item) => item.itemId), [5]);
        assert.deepEqual(revisionJob.inputSnapshot.closetItemPool.map((item) => item.itemId), [4, 5, 6, 7]);
        await service.processGenerationJob(revision.jobId);
        await assert.rejects(() => service.createRevision(1, resultId, { replaceItemId: 4, newItemId: 6 }), { code: 'ITEM_NOT_COMPATIBLE' });
    });
    it('reuses an Idempotency-Key only for the same revision request', async () => {
        const repository = new MemoryOutfitRepository(); const service = new OutfitService({ repository, aiAdapter: readyAdapter });
        const created = await service.createGenerationJob(1, { closetItemIds: [4] }); await service.processGenerationJob(created.jobId);
        const resultId = (await service.getGenerationJob(1, created.jobId)).outfitResultId;
        const first = await service.createRevision(1, resultId, { replaceItemId: 4, newItemId: 5 }, 'revision-1');
        const retry = await service.createRevision(1, resultId, { replaceItemId: 4, newItemId: 5 }, 'revision-1');
        assert.equal(retry.revisionId, first.revisionId);
        assert.equal(retry.jobId, first.jobId);
        assert.equal(repository.revisions.length, 1);
        await assert.rejects(
            () => service.createRevision(1, resultId, { replaceItemId: 4, newItemId: 6 }, 'revision-1'),
            { code: 'CONFLICT409' }
        );
    });
    it('returns CONFLICT409 when a concurrent revision request claims the same key with different input', async () => {
        const repository = new MemoryOutfitRepository(); const service = new OutfitService({ repository, aiAdapter: readyAdapter });
        const created = await service.createGenerationJob(1, { closetItemIds: [4] }); await service.processGenerationJob(created.jobId);
        const resultId = (await service.getGenerationJob(1, created.jobId)).outfitResultId;
        let lookupCount = 0;
        const originalLookup = repository.findJobByIdempotencyKey.bind(repository);
        repository.findJobByIdempotencyKey = async (...args) => (++lookupCount === 1 ? null : originalLookup(...args));
        repository.createRevisionJob = async ({ job }, now) => {
            const collision = {
                id: repository.next++, status: 'QUEUED', createdAt: new Date(now), completedAt: null,
                failureCode: null, failureReason: null, result: null, ...job
            };
            repository.jobs.push(collision);
            repository.revisions.push({
                id: repository.next++, userId: 1, generationJobId: collision.id,
                sourceOutfitResultId: resultId, replaceItemId: 4, newItemId: 6
            });
            const error = new Error('duplicate idempotency key'); error.code = 'P2002'; throw error;
        };
        await assert.rejects(
            () => service.createRevision(1, resultId, { replaceItemId: 4, newItemId: 5 }, 'revision-race'),
            { status: 409, code: 'CONFLICT409' }
        );
    });
    it('automatically expires stalled and old unsaved jobs but preserves soft-deleted saved results', async () => {
        const repository = new MemoryOutfitRepository();
        const now = new Date('2026-08-05T12:00:00.000Z');
        const service = new OutfitService({ repository, aiAdapter: readyAdapter, now: () => now });

        const stalled = await service.createGenerationJob(1, { closetItemIds: [4] });
        repository.jobs.find((job) => job.id === stalled.jobId).expiresAt = new Date('2026-08-05T11:59:59.000Z');
        let cleaned = await service.cleanupExpiredJobs();
        assert.deepEqual(cleaned, { staleJobs: 1, expiredResults: 0, expiredDeletedOutfits: 0 });

        const unsaved = await service.createGenerationJob(1, { closetItemIds: [4] });
        await service.processGenerationJob(unsaved.jobId);
        repository.jobs.find((job) => job.id === unsaved.jobId).completedAt = new Date('2026-08-04T11:59:59.000Z');
        cleaned = await service.cleanupExpiredJobs();
        assert.equal(cleaned.expiredResults, 1);
        assert.equal(repository.jobs.find((job) => job.id === unsaved.jobId).status, 'EXPIRED');
        const expired = await service.getGenerationJob(1, unsaved.jobId);
        assert.equal(expired.generatedImageUrl, null);

        const kept = await service.createGenerationJob(1, { closetItemIds: [4] });
        await service.processGenerationJob(kept.jobId);
        const keptResultId = (await service.getGenerationJob(1, kept.jobId)).outfitResultId;
        const saved = await service.saveOutfit(1, { outfitResultId: keptResultId });
        await service.deleteSavedOutfit(1, saved.id);
        repository.jobs.find((job) => job.id === kept.jobId).completedAt = new Date('2026-08-04T11:59:59.000Z');
        cleaned = await service.cleanupExpiredJobs();
        assert.equal(cleaned.expiredResults, 0);
        assert.equal(repository.jobs.find((job) => job.id === kept.jobId).status, 'COMPLETED');
    });
    it('permanently removes soft-deleted saved outfits after thirty days', async () => {
        const repository = new MemoryOutfitRepository();
        let now = new Date('2026-08-01T12:00:00.000Z');
        const service = new OutfitService({ repository, aiAdapter: readyAdapter, now: () => now });
        const created = await service.createGenerationJob(1, { closetItemIds: [4] });
        await service.processGenerationJob(created.jobId);
        const resultId = (await service.getGenerationJob(1, created.jobId)).outfitResultId;
        const saved = await service.saveOutfit(1, { outfitResultId: resultId });
        await service.deleteSavedOutfit(1, saved.id);

        now = new Date('2026-08-31T12:00:00.001Z');
        const cleaned = await service.cleanupExpiredJobs();
        assert.equal(cleaned.expiredDeletedOutfits, 1);
        assert.equal((await service.getDeletedSavedOutfits(1, {})).pagination.totalCount, 0);
        await assert.rejects(() => service.restoreSavedOutfit(1, saved.id), { code: 'NOT_FOUND404' });
    });
    for (const [name, adapter] of [
        ['timeout', { generate: async () => { const error = new Error('timeout'); error.code = 'AI_TIMEOUT'; throw error; } }],
        ['rejection', { generate: async () => { const error = new Error('unavailable'); error.code = 'AI_UNAVAILABLE'; throw error; } }],
        ['foreign recommendation', { generate: async () => ({ generatedImageUrl: 'https://ai.example/outfit.png', provider: 'test-ai', fallbackUsed: false, recommendedClosetItemIds: [99] }) }],
        ['duplicate category recommendation', { generate: async () => ({
            generatedImageUrl: 'https://ai.example/outfit.png', provider: 'test-ai', modelVersion: 'test-v1', fallbackUsed: false,
            outfitItems: [{ slot: 'top', itemId: 4 }, { slot: 'outer', itemId: 5 }], recommendedClosetItemIds: [4, 5]
        }) }]
    ]) it(`completes with fallback after ${name}`, async () => {
        const repository = new MemoryOutfitRepository(); const service = new OutfitService({ repository, aiAdapter: adapter });
        const created = await service.createGenerationJob(1, { closetItemIds: [4] }); await service.processGenerationJob(created.jobId);
        const job = await service.getGenerationJob(1, created.jobId);
        assert.equal(job.status, 'completed');
        assert.equal(job.generatedImage.fallbackUsed, true);
        assert.deepEqual(job.generatedImage.recommendedClosetItemIds, [4]);
    });
    it('accepts only root-relative or HTTPS fallback URLs', async () => {
        const repository = new MemoryOutfitRepository();
        const service = new OutfitService({
            repository,
            aiAdapter: { generate: async () => { throw new Error('unavailable'); } },
            fallbackImageUrl: 'javascript:alert(1)'
        });
        const created = await service.createGenerationJob(1, { closetItemIds: [4] });
        await service.processGenerationJob(created.jobId);
        const job = await service.getGenerationJob(1, created.jobId);
        assert.equal(job.generatedImage.imageUrl, '/fallback/mock-outfit-preview.jpg');
    });

    it('rotates across every packaged mock fallback image', () => {
        const service = new OutfitService({ repository: new MemoryOutfitRepository(), aiAdapter: readyAdapter });
        assert.deepEqual(
            [1, 2, 3, 4, 5].map((jobId) => service.fallbackImageUrlFor(jobId)),
            [
                '/fallback/mock-outfit-preview.jpg',
                '/fallback/mock-outfit-leather.jpg',
                '/fallback/mock-outfit-cardigan.jpg',
                '/fallback/mock-outfit-striped.jpg',
                '/fallback/mock-outfit-gray-knit.jpg'
            ]
        );
    });
});

describe('OutfitAiAdapter', () => {
    it('derives the internal rain flag from weather.condition', async () => {
        let requestBody;
        const adapter = new OutfitAiAdapter({
            endpoint: 'http://ai.internal',
            fetchImpl: async (_, request) => {
                requestBody = JSON.parse(request.body);
                return new Response(JSON.stringify({ generatedImageUrl: 'https://ai.example/outfit.png', recommendedClosetItemIds: [4], modelVersion: 'outfit-v1' }), { status: 200 });
            }
        });
        const inputSnapshot = {
            schemaVersion: 'outfit-input-v1',
            bodyProfile: { id: 7, bodyBalance: 'BALANCED' },
            stylePreferences: [{ styleTagId: 2, code: 'MINIMAL', name: '미니멀' }],
            selectedItems: [{ itemId: 4 }],
            closetItemPool: [{ itemId: 4 }, { itemId: 5 }],
            moodContext: { type: 'DATE' },
            selectedDate: '2026-08-05',
            weatherContext: { condition: 'RAINY', temperature: 18 }
        };
        const result = await adapter.generate({
            jobId: 1, userId: 1, closetItemIds: [4], styleTagIds: [2], inputSnapshot,
            weather: inputSnapshot.weatherContext
        });
        assert.equal(requestBody.weatherContext.rain, true);
        assert.equal(requestBody.outfitJobId, '1');
        assert.deepEqual(requestBody.bodyProfile, inputSnapshot.bodyProfile);
        assert.deepEqual(requestBody.closetItemPool, inputSnapshot.closetItemPool);
        assert.equal(result.modelVersion, 'outfit-v1');
    });
    it('accepts the ETL outfitItems response and derives legacy item IDs', async () => {
        const adapter = new OutfitAiAdapter({
            endpoint: 'http://ai.internal',
            fetchImpl: async () => new Response(JSON.stringify({
                generatedImageUrl: 'https://ai.example/outfit.png',
                outfitItems: [{ slot: 'top', itemId: 4 }, { slot: 'bottom', itemId: 6 }],
                modelVersion: 'outfit-v1'
            }), { status: 200 })
        });
        const result = await adapter.generate({ jobId: 1, userId: 1, closetItemIds: [4], styleTagIds: [] });
        assert.deepEqual(result.outfitItems, [{ slot: 'top', itemId: 4 }, { slot: 'bottom', itemId: 6 }]);
        assert.deepEqual(result.recommendedClosetItemIds, [4, 6]);
    });
    it('rejects duplicated ETL outfit item slots', async () => {
        const adapter = new OutfitAiAdapter({
            endpoint: 'http://ai.internal',
            fetchImpl: async () => new Response(JSON.stringify({
                generatedImageUrl: 'https://ai.example/outfit.png',
                outfitItems: [{ slot: 'top', itemId: 4 }, { slot: 'top', itemId: 5 }],
                modelVersion: 'outfit-v1'
            }), { status: 200 })
        });
        await assert.rejects(
            () => adapter.generate({ jobId: 1, userId: 1, closetItemIds: [4], styleTagIds: [] }),
            { code: 'AI_INVALID_RESPONSE' }
        );
    });
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

describe('OutfitRepository', () => {
    it('creates a new job and debits its puzzle cost in the same transaction', async () => {
        let balance = 20;
        const transactions = [];
        const tx = {
            outfitGenerationJob: {
                findFirst: async () => null,
                updateMany: async () => ({ count: 0 }),
                create: async ({ data }) => ({ id: 31, status: 'QUEUED', ...data })
            },
            puzzleWallet: {
                upsert: async () => ({ userId: 1, balance }),
                updateMany: async ({ where, data }) => {
                    if (balance < where.balance.gte) return { count: 0 };
                    balance -= data.balance.decrement;
                    return { count: 1 };
                },
                findUniqueOrThrow: async () => ({ userId: 1, balance })
            },
            puzzleTransaction: {
                create: async ({ data }) => { transactions.push(data); return data; }
            }
        };
        const repository = new OutfitRepository({
            outfitGenerationJob: {},
            $transaction: async (operation) => operation(tx)
        });

        const result = await repository.createOrFindActiveJob(
            { userId: 1, closetItemIds: [4], styleTagIds: [], expiresAt: new Date('2026-08-13T00:10:00Z') },
            new Date('2026-08-13T00:00:00Z'),
            { amount: 10 }
        );

        assert.equal(result.isExistingJob, false);
        assert.equal(balance, 10);
        assert.deepEqual(transactions[0], {
            userId: 1,
            type: 'DEBIT',
            amount: 10,
            balanceAfter: 10,
            reason: 'OUTFIT_GENERATION',
            idempotencyKey: 'outfit-generation:31',
            referenceType: 'OUTFIT_GENERATION_JOB',
            referenceId: '31'
        });
    });

    it('does not debit puzzles when returning an existing active job', async () => {
        let walletTouched = false;
        const active = { id: 9, userId: 1, status: 'PROCESSING' };
        const repository = new OutfitRepository({
            outfitGenerationJob: {},
            $transaction: async (operation) => operation({
                outfitGenerationJob: { findFirst: async () => active },
                puzzleWallet: { upsert: async () => { walletTouched = true; } }
            })
        });

        const result = await repository.createOrFindActiveJob(
            { userId: 1 },
            new Date('2026-08-13T00:00:00Z'),
            { amount: 10 }
        );

        assert.equal(result.isExistingJob, true);
        assert.equal(walletTouched, false);
    });

    it('rejects a new job when the puzzle balance is insufficient', async () => {
        const tx = {
            outfitGenerationJob: {
                findFirst: async () => null,
                updateMany: async () => ({ count: 0 }),
                create: async ({ data }) => ({ id: 32, status: 'QUEUED', ...data })
            },
            puzzleWallet: {
                upsert: async () => ({ userId: 1, balance: 10 }),
                updateMany: async () => ({ count: 0 })
            }
        };
        const repository = new OutfitRepository({
            outfitGenerationJob: {},
            $transaction: async (operation) => operation(tx)
        });

        await assert.rejects(
            () => repository.createOrFindActiveJob(
                { userId: 1 },
                new Date('2026-08-13T00:00:00Z'),
                { amount: 10 }
            ),
            (error) => error.status === 409 && error.code === 'PUZZLE409_01'
        );
    });

    it('returns the related outfit result when a saved outfit is created', async () => {
        let createArgs;
        const repository = new OutfitRepository({
            outfitGenerationJob: {},
            savedOutfit: {
                create: async (args) => {
                    createArgs = args;
                    return {
                        id: 3,
                        userId: 1,
                        outfitResultId: 2,
                        name: 'daily',
                        outfitResult: { generatedImageUrl: '/fallback/default-outfit.png' }
                    };
                }
            }
        });

        const saved = await repository.saveResult({ userId: 1, outfitResultId: 2, name: 'daily' });

        assert.deepEqual(createArgs.include, { outfitResult: { include: { generationJob: true } } });
        assert.equal(saved.outfitResult.generatedImageUrl, '/fallback/default-outfit.png');
    });
});

describe('Outfit HTTP auth boundary', () => {
    it('serves the packaged fallback image without authentication', async () => {
        const app = createApp({ outfitService: new OutfitService({ repository: new MemoryOutfitRepository(), aiAdapter: readyAdapter }), healthCheck: async () => {} });
        const response = await request(app).get('/fallback/default-outfit.png');
        assert.equal(response.status, 200);
        assert.equal(response.headers['content-type'], 'image/png');
        assert.deepEqual([...response.body.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    });
    it('serves all packaged mock outfit images without authentication', async () => {
        const app = createApp({ outfitService: new OutfitService({ repository: new MemoryOutfitRepository(), aiAdapter: readyAdapter }), healthCheck: async () => {} });
        for (const name of ['preview', 'leather', 'cardigan', 'striped', 'gray-knit']) {
            const response = await request(app).get(`/fallback/mock-outfit-${name}.jpg`);
            assert.equal(response.status, 200);
            assert.equal(response.headers['content-type'], 'image/jpeg');
            assert.deepEqual([...response.body.subarray(0, 3)], [0xff, 0xd8, 0xff]);
        }
    });
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
            const created = await api.post('/api/v1/outfits/generation-jobs').set('authorization', `Bearer ${token}`).send({
                closetItemIds: [4], userId: 2, weather: { condition: 'WINDY' }
            }).set('idempotency-key', 'http-generation-1');
            assert.equal(created.status, 200);
            assert.equal(repository.jobs[0].userId, 1);
            assert.equal(repository.jobs[0].idempotencyKey, 'http-generation-1');
            assert.deepEqual(repository.jobs[0].weather, { condition: 'WINDY' });
        } finally {
            if (oldSecret === undefined) delete process.env.JWT_ACCESS_SECRET; else process.env.JWT_ACCESS_SECRET = oldSecret;
        }
    });
    it('queues generation without running AI work in the HTTP request process', async () => {
        const repository = new MemoryOutfitRepository();
        const service = new OutfitService({ repository, aiAdapter: readyAdapter });
        const app = createApp({ outfitService: service, healthCheck: async () => {} });
        const oldSecret = process.env.JWT_ACCESS_SECRET;
        process.env.JWT_ACCESS_SECRET = 'a-long-test-secret-that-is-at-least-32-chars';
        try {
            const token = jwt.sign({ sub: '1' }, process.env.JWT_ACCESS_SECRET, { algorithm: 'HS256' });
            const created = await request(app)
                .post('/api/v1/outfits/generation-jobs')
                .set('authorization', `Bearer ${token}`)
                .send({ closetItemIds: [4] });
            assert.equal(created.status, 200);

            const job = await service.getGenerationJob(1, created.body.result.jobId);
            assert.equal(job.status, 'queued');
            assert.equal(job.generatedImage, null);
        } finally {
            if (oldSecret === undefined) delete process.env.JWT_ACCESS_SECRET; else process.env.JWT_ACCESS_SECRET = oldSecret;
        }
    });
    it('exposes active-job, revision, and saved-outfit trash routes through the JWT chain', async () => {
        const repository = new MemoryOutfitRepository();
        const service = new OutfitService({ repository, aiAdapter: readyAdapter });
        const app = createApp({ outfitService: service, healthCheck: async () => {} });
        const oldSecret = process.env.JWT_ACCESS_SECRET;
        process.env.JWT_ACCESS_SECRET = 'a-long-test-secret-that-is-at-least-32-chars';
        try {
            const token = jwt.sign({ sub: '1' }, process.env.JWT_ACCESS_SECRET, { algorithm: 'HS256' });
            const auth = { authorization: `Bearer ${token}` };
            const queued = await service.createGenerationJob(1, { closetItemIds: [4] });
            const active = await request(app).get('/api/v1/outfits/generation-jobs/active').set(auth);
            assert.equal(active.status, 200);
            assert.equal(active.body.result.jobId, queued.jobId);
            await service.processGenerationJob(queued.jobId);
            const resultId = (await service.getGenerationJob(1, queued.jobId)).outfitResultId;

            const revision = await request(app).post(`/api/v1/outfits/${resultId}/revisions`).set(auth).send({ replaceItemId: 4, newItemId: 5 });
            assert.equal(revision.status, 200);
            assert.equal(revision.body.result.parentOutfitResultId, resultId);
            assert.equal(repository.jobs.find((job) => job.id === revision.body.result.jobId).closetItemIds[0], 5);
            const saved = await service.saveOutfit(1, { outfitResultId: resultId, name: 'daily' });
            assert.equal((await request(app).delete(`/api/v1/outfits/saved/${saved.id}`).set(auth)).status, 200);
            const deleted = await request(app).get('/api/v1/outfits/saved/deleted').set(auth);
            assert.equal(deleted.body.result.pagination.totalCount, 1);
            assert.equal((await request(app).post(`/api/v1/outfits/saved/${saved.id}/restore`).set(auth)).status, 200);
        } finally {
            if (oldSecret === undefined) delete process.env.JWT_ACCESS_SECRET; else process.env.JWT_ACCESS_SECRET = oldSecret;
        }
    });
});
