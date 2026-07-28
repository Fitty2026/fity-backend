const httpError = (status, code, message) => Object.assign(new Error(message), { status, code });
const normalizeIds = (value, field, { required = false } = {}) => {
    if (value == null && !required) return [];
    if (!Array.isArray(value) || (required && value.length === 0) || !value.every((id) => Number.isSafeInteger(id) && id > 0)) throw httpError(400, 'REQUEST400', `${field} must be an array of positive integer IDs.`);
    return [...new Set(value)];
};
const DEFAULT_FALLBACK_IMAGE_URL = '/fallback/default-outfit.png';
const normalizeFallbackImageUrl = (value) => {
    if (typeof value !== 'string' || value.trim() === '') return DEFAULT_FALLBACK_IMAGE_URL;
    const candidate = value.trim();
    try {
        if (candidate.startsWith('/') && !candidate.startsWith('//')) {
            const parsed = new URL(candidate, 'https://fitty.local');
            return `${parsed.pathname}${parsed.search}${parsed.hash}`;
        }
        const parsed = new URL(candidate);
        return parsed.protocol === 'https:' && !parsed.username && !parsed.password
            ? parsed.toString()
            : DEFAULT_FALLBACK_IMAGE_URL;
    } catch {
        return DEFAULT_FALLBACK_IMAGE_URL;
    }
};
const createFallbackResult = (job, generatedImageUrl) => ({
    generatedImageUrl,
    recommendedClosetItemIds: [...job.closetItemIds],
    provider: 'fitty-fallback',
    fallbackUsed: true
});
const toJob = (job) => ({ jobId: job.id, status: job.status.toLowerCase(), outfitResultId: job.result?.id ?? null, generatedImage: job.result ? { outfitResultId: job.result.id, imageUrl: job.result.generatedImageUrl, provider: job.result.provider, fallbackUsed: job.result.fallbackUsed, recommendedClosetItemIds: job.result.recommendedClosetItemIds } : null, failure: job.status === 'FAILED' ? { code: job.failureCode, reason: job.failureReason } : null, createdAt: job.createdAt, completedAt: job.completedAt });
const toSaved = (saved) => ({ id: saved.id, savedOutfitId: saved.id, outfitResultId: saved.outfitResultId, name: saved.name, imageUrl: saved.outfitResult.generatedImageUrl, createdAt: saved.createdAt, savedAt: saved.createdAt, isSaved: true });

export class OutfitService {
    constructor({ repository, aiAdapter, fallbackImageUrl = process.env.FALLBACK_OUTFIT_IMAGE_URL }) {
        this.repository = repository;
        this.aiAdapter = aiAdapter;
        this.fallbackImageUrl = normalizeFallbackImageUrl(fallbackImageUrl);
    }
    async createGenerationJob(userId, input = {}) {
        const closetItemIds = normalizeIds(input.closetItemIds, 'closetItemIds', { required: true });
        const styleTagIds = normalizeIds(input.styleTagIds, 'styleTagIds');
        const bodyProfileId = input.bodyProfileId == null ? null : Number(input.bodyProfileId);
        if (bodyProfileId !== null && (!Number.isSafeInteger(bodyProfileId) || bodyProfileId <= 0)) throw httpError(400, 'REQUEST400', 'bodyProfileId must be a positive integer.');
        const ownedItemIds = await this.repository.findOwnedClosetItemIds(userId, closetItemIds);
        if (ownedItemIds.length !== closetItemIds.length) throw httpError(403, 'FORBIDDEN403', 'Closet item ownership check failed.');
        if (bodyProfileId !== null && !await this.repository.findOwnedBodyProfile(userId, bodyProfileId)) {
            throw httpError(404, 'NOT_FOUND404', 'Body profile was not found.');
        }
        const job = await this.repository.createJob({ userId, bodyProfileId, closetItemIds, styleTagIds });
        return { jobId: job.id, status: 'queued', createdAt: job.createdAt };
    }
    async getGenerationJob(userId, rawId) {
        const job = await this.repository.findJob(userId, Number(rawId));
        if (!job) throw httpError(404, 'NOT_FOUND404', 'Outfit generation job was not found.');
        return toJob(job);
    }
    async processGenerationJob(rawId) {
        const job = await this.repository.claimQueuedJob(Number(rawId));
        if (!job) return null;
        try {
            let result;
            try {
                result = await this.aiAdapter.generate({ jobId: job.id, userId: job.userId, bodyProfileId: job.bodyProfileId, closetItemIds: job.closetItemIds, styleTagIds: job.styleTagIds });
                const ownedRecommendationIds = await this.repository.findOwnedClosetItemIds(job.userId, result.recommendedClosetItemIds);
                if (ownedRecommendationIds.length !== result.recommendedClosetItemIds.length) throw Object.assign(new Error('AI recommended an inaccessible closet item.'), { code: 'AI_INVALID_RECOMMENDATION' });
            } catch {
                result = createFallbackResult(job, this.fallbackImageUrl);
            }
            await this.repository.completeJob({ job, aiResult: result });
        }
        catch (error) { await this.repository.failJob({ id: job.id, code: error.code || 'AI_GENERATION_FAILED', reason: error.message || 'AI generation failed.' }); }
        return this.repository.findJob(job.userId, job.id);
    }
    async saveOutfit(userId, { outfitResultId, name } = {}) {
        const result = await this.repository.findResult(userId, Number(outfitResultId));
        if (!result) throw httpError(404, 'NOT_FOUND404', 'Outfit result was not found.');
        try { return toSaved(await this.repository.saveResult({ userId, outfitResultId: result.id, name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 120) : 'saved outfit' })); }
        catch (error) { if (error.code === 'P2002') throw httpError(409, 'CONFLICT409', 'Outfit result is already saved.'); throw error; }
    }
    async getSavedOutfits(userId, { page = 1, size = 10 }) {
        page = Number(page); size = Number(size);
        if (!Number.isSafeInteger(page) || !Number.isSafeInteger(size) || page < 1 || size < 1 || size > 50) throw httpError(400, 'REQUEST400', 'Invalid pagination value.');
        const [items, totalCount] = await this.repository.listSaved(userId, (page - 1) * size, size);
        return { items: items.map(toSaved), pagination: { page, size, totalCount } };
    }
    async deleteSavedOutfit(userId, rawId) {
        const deleted = await this.repository.deleteSaved(userId, Number(rawId));
        if (deleted.count !== 1) throw httpError(404, 'NOT_FOUND404', 'Saved outfit was not found.');
        return null;
    }
}
