const httpError = (status, code, message) => Object.assign(new Error(message), { status, code });
const ACTIVE_STATUSES = new Set(['QUEUED', 'PROCESSING', 'QC_PENDING']);
const SITUATIONS = new Set(['DATE', 'WORK', 'SCHOOL', 'TRAVEL']);
const WEATHER_CONDITIONS = new Set(['SUNNY', 'CLOUDY', 'RAINY', 'SNOWY', 'WINDY', 'UNKNOWN']);
const JOB_TTL_MS = 10 * 60 * 1000;
const RESULT_TTL_MS = 24 * 60 * 60 * 1000;
const isResultExpired = (result, now) => result.generationJob.status !== 'COMPLETED'
    || !result.generationJob.completedAt
    || now.getTime() - new Date(result.generationJob.completedAt).getTime() >= RESULT_TTL_MS;
const positiveId = (value, field) => {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) throw httpError(400, 'REQUEST400', `${field} must be a positive integer.`);
    return id;
};

const normalizeIds = (value, field, { required = false, maximum } = {}) => {
    if (value == null && !required) return [];
    if (Array.isArray(value) && maximum && value.length > maximum) {
        throw httpError(400, 'REQUEST400', `${field} must contain ${maximum} IDs or fewer.`);
    }
    if (!Array.isArray(value) || (required && value.length === 0)
        || !value.every((id) => Number.isSafeInteger(id) && id > 0)) {
        throw httpError(400, 'REQUEST400', `${field} must be an array of positive integer IDs.`);
    }
    return [...new Set(value)];
};

const normalizeOptionalEnum = (value, field, allowed) => {
    if (value == null) return null;
    if (typeof value !== 'string' || !allowed.has(value)) {
        throw httpError(400, 'REQUEST400', `${field} has an unsupported value.`);
    }
    return value;
};

const normalizeSelectedDate = (value) => {
    if (value == null) return null;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw httpError(400, 'REQUEST400', 'selectedDate must use YYYY-MM-DD format.');
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
        throw httpError(400, 'REQUEST400', 'selectedDate is not a valid date.');
    }
    return date;
};

const normalizeWeather = (value) => {
    if (value == null) return null;
    if (typeof value !== 'object' || Array.isArray(value)) throw httpError(400, 'REQUEST400', 'weather must be an object.');
    const condition = normalizeOptionalEnum(value.condition, 'weather.condition', WEATHER_CONDITIONS);
    if (!condition) throw httpError(400, 'REQUEST400', 'weather.condition is required when weather is provided.');
    if (value.temperature != null && (typeof value.temperature !== 'number' || !Number.isFinite(value.temperature))) {
        throw httpError(400, 'REQUEST400', 'weather.temperature must be a finite number.');
    }
    return { condition, ...(value.temperature == null ? {} : { temperature: value.temperature }) };
};

const normalizeText = (value, fallback, maxLength, field = 'text') => {
    if (value == null || value === '') return fallback;
    if (typeof value !== 'string') throw httpError(400, 'REQUEST400', 'Text fields must be strings.');
    const normalized = value.trim();
    if (normalized.length > maxLength) throw httpError(400, 'REQUEST400', `${field} must be ${maxLength} characters or fewer.`);
    return normalized || fallback;
};

const normalizeTags = (value) => {
    if (value == null) return [];
    if (!Array.isArray(value) || !value.every((tag) => typeof tag === 'string' && tag.trim())) {
        throw httpError(400, 'REQUEST400', 'tags must be an array of non-empty strings.');
    }
    const normalized = [...new Set(value.map((tag) => tag.trim()))];
    if (normalized.length > 5) throw httpError(400, 'REQUEST400', 'tags must contain five values or fewer.');
    return normalized;
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
        return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.toString() : DEFAULT_FALLBACK_IMAGE_URL;
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

const jobInput = (job) => ({
    closetItemIds: job.closetItemIds,
    styleTagIds: job.styleTagIds,
    situation: job.situation ?? null,
    selectedDate: job.selectedDate ? new Date(job.selectedDate).toISOString().slice(0, 10) : null,
    weather: job.weather ?? null
});

const toJob = (job, { isExistingJob, includeInput = false, includeResult = true } = {}) => ({
    jobId: job.id,
    status: job.status.toLowerCase(),
    progress: job.progress,
    ...(isExistingJob === undefined ? {} : { isExistingJob }),
    ...(includeInput ? { input: jobInput(job) } : {}),
    expiresAt: job.expiresAt,
    ...(includeResult ? { outfitResultId: job.status === 'EXPIRED' ? null : job.result?.id ?? null } : {}),
    ...(includeResult ? { generatedImage: job.result && job.status !== 'EXPIRED' ? {
        outfitResultId: job.result.id,
        imageUrl: job.result.generatedImageUrl,
        provider: job.result.provider,
        fallbackUsed: job.result.fallbackUsed,
        recommendedClosetItemIds: job.result.recommendedClosetItemIds
    } : null } : {}),
    ...(includeResult ? { failure: ['FAILED', 'EXPIRED'].includes(job.status) ? { code: job.failureCode, message: job.failureReason } : null } : {}),
    createdAt: job.createdAt,
    completedAt: job.completedAt
});

const toSaved = (saved) => ({
    id: saved.id,
    savedOutfitId: saved.id,
    outfitResultId: saved.outfitResultId,
    name: saved.name,
    imageUrl: saved.outfitResult.generatedImageUrl,
    items: saved.outfitResult.recommendedClosetItemIds,
    styleTags: saved.outfitResult.generationJob?.styleTagIds ?? [],
    tags: saved.tags,
    memo: saved.memo,
    createdAt: saved.createdAt,
    updatedAt: saved.updatedAt,
    deletedAt: saved.deletedAt,
    isSaved: true
});

const pagination = ({ page = 1, size = 10 }) => {
    page = Number(page);
    size = Number(size);
    if (!Number.isSafeInteger(page) || !Number.isSafeInteger(size) || page < 1 || size < 1 || size > 50) {
        throw httpError(400, 'REQUEST400', 'Invalid pagination value.');
    }
    return { page, size };
};

export class OutfitService {
    constructor({ repository, aiAdapter, fallbackImageUrl = process.env.FALLBACK_OUTFIT_IMAGE_URL, now = () => new Date() }) {
        this.repository = repository;
        this.aiAdapter = aiAdapter;
        this.fallbackImageUrl = normalizeFallbackImageUrl(fallbackImageUrl);
        this.now = now;
    }

    async createGenerationJob(userId, input = {}) {
        const closetItemIds = normalizeIds(input.closetItemIds, 'closetItemIds', { required: true, maximum: 3 });
        const styleTagIds = normalizeIds(input.styleTagIds, 'styleTagIds');
        const situation = normalizeOptionalEnum(input.situation, 'situation', SITUATIONS);
        const selectedDate = normalizeSelectedDate(input.selectedDate);
        const weather = normalizeWeather(input.weather);
        const ownedItemIds = await this.repository.findOwnedClosetItemIds(userId, closetItemIds);
        if (ownedItemIds.length !== closetItemIds.length) throw httpError(403, 'FORBIDDEN403', 'Closet item ownership check failed.');
        if (styleTagIds.length > 0) {
            const ownedStyleTagIds = await this.repository.findOwnedStyleTagIds(userId, styleTagIds);
            if (ownedStyleTagIds.length !== styleTagIds.length) throw httpError(404, 'NOT_FOUND404', 'Style preference was not found.');
        }
        const bodyProfile = await this.repository.findActiveBodyProfile(userId);
        if (!bodyProfile) throw httpError(404, 'NOT_FOUND404', 'Active body profile was not found.');
        const now = this.now();
        const jobData = {
            userId, bodyProfileId: bodyProfile.id, closetItemIds, styleTagIds, situation,
            selectedDate, weather, progress: 5, expiresAt: new Date(now.getTime() + JOB_TTL_MS)
        };
        let created;
        for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
                created = await this.repository.createOrFindActiveJob(jobData, now);
                break;
            } catch (error) {
                if (error.code !== 'P2034' || attempt === 2) throw error;
            }
        }
        const { job, isExistingJob } = created;
        return toJob(job, { isExistingJob, includeInput: true, includeResult: false });
    }

    async getGenerationJob(userId, rawId) {
        let job = await this.repository.findJob(userId, positiveId(rawId, 'jobId'));
        if (!job) throw httpError(404, 'NOT_FOUND404', 'Outfit generation job was not found.');
        const now = this.now();
        if (ACTIVE_STATUSES.has(job.status) && new Date(job.expiresAt) <= now) {
            await this.repository.expireStaleActiveJobs(userId, now);
            job = await this.repository.findJob(userId, job.id);
        }
        const resultExpired = job.status === 'COMPLETED' && job.completedAt
            && now.getTime() - new Date(job.completedAt).getTime() >= RESULT_TTL_MS
            && (job.result?.savedOutfits?.length ?? 0) === 0;
        if (resultExpired) {
            await this.repository.expireCompletedJob(job.id);
            job = await this.repository.findJob(userId, job.id);
        }
        return toJob(job);
    }

    async getActiveGenerationJob(userId) {
        const now = this.now();
        await this.repository.expireStaleActiveJobs(userId, now);
        const job = await this.repository.findActiveJob(userId, now);
        return job ? toJob(job, { isExistingJob: true, includeInput: true, includeResult: false }) : null;
    }

    async createRevision(userId, rawResultId, input = {}) {
        const outfitResultId = positiveId(rawResultId, 'outfitResultId');
        const replaceItemId = positiveId(input.replaceItemId, 'replaceItemId');
        const newItemId = positiveId(input.newItemId, 'newItemId');
        if (replaceItemId === newItemId) throw httpError(400, 'REQUEST400', 'replaceItemId and newItemId must be different.');
        const source = await this.repository.findResult(userId, outfitResultId);
        if (!source) throw httpError(404, 'NOT_FOUND404', 'Outfit result was not found.');
        if (isResultExpired(source, this.now())) throw httpError(404, 'NOT_FOUND404', 'Outfit result is no longer available.');
        const itemIds = source.recommendedClosetItemIds;
        if (!itemIds.includes(replaceItemId)) throw httpError(400, 'REQUEST400', 'replaceItemId is not part of the outfit result.');
        const ownedItems = await this.repository.findOwnedClosetItems(userId, [replaceItemId, newItemId]);
        if (ownedItems.length !== 2) throw httpError(404, 'NOT_FOUND404', 'Closet item was not found.');
        const categories = new Map(ownedItems.map((item) => [item.id, item.category]));
        if (categories.get(replaceItemId) !== categories.get(newItemId)) throw httpError(409, 'ITEM_NOT_COMPATIBLE', 'Replacement item category must match.');
        const now = this.now();
        await this.repository.expireStaleActiveJobs(userId, now);
        if (await this.repository.findActiveJob(userId, now)) throw httpError(409, 'CONFLICT409', 'An outfit generation job is already in progress.');
        const closetItemIds = itemIds.map((id) => id === replaceItemId ? newItemId : id);
        const bodyProfile = await this.repository.findActiveBodyProfile(userId);
        if (!bodyProfile) throw httpError(404, 'NOT_FOUND404', 'Active body profile was not found.');
        let created;
        try {
            created = await this.repository.createRevisionJob({
                revision: { userId, sourceOutfitResultId: source.id, replaceItemId, newItemId },
                job: {
                    userId, bodyProfileId: bodyProfile.id, closetItemIds,
                    styleTagIds: source.generationJob.styleTagIds, situation: source.generationJob.situation,
                    selectedDate: source.generationJob.selectedDate, weather: source.generationJob.weather,
                    progress: 5, expiresAt: new Date(now.getTime() + JOB_TTL_MS)
                }
            }, now);
        } catch (error) {
            if (error.code === 'ACTIVE_JOB_EXISTS' || error.code === 'P2034') {
                throw httpError(409, 'CONFLICT409', 'An outfit generation job is already in progress.');
            }
            throw error;
        }
        const { job, revision } = created;
        return {
            revisionId: revision.id,
            jobId: job.id,
            parentOutfitResultId: source.id,
            status: job.status.toLowerCase(),
            progress: job.progress,
            createdAt: job.createdAt,
            expiresAt: job.expiresAt
        };
    }

    async processGenerationJob(rawId) {
        const job = await this.repository.claimQueuedJob(Number(rawId), this.now());
        if (!job) return null;
        try {
            let result;
            try {
                result = await this.aiAdapter.generate({
                    jobId: job.id, userId: job.userId, bodyProfileId: job.bodyProfileId,
                    closetItemIds: job.closetItemIds, styleTagIds: job.styleTagIds,
                    situation: job.situation,
                    selectedDate: job.selectedDate ? new Date(job.selectedDate).toISOString().slice(0, 10) : null,
                    weather: job.weather
                });
                const ownedRecommendationIds = await this.repository.findOwnedClosetItemIds(job.userId, result.recommendedClosetItemIds);
                if (ownedRecommendationIds.length !== result.recommendedClosetItemIds.length) {
                    throw Object.assign(new Error('AI recommended an inaccessible closet item.'), { code: 'AI_INVALID_RECOMMENDATION' });
                }
            } catch {
                result = createFallbackResult(job, this.fallbackImageUrl);
            }
            const transitioned = await this.repository.markQcPending(job.id);
            if (transitioned.count !== 1) throw new Error('Outfit job QC transition failed.');
            await this.repository.completeJob({ job, aiResult: result });
        } catch (error) {
            await this.repository.failJob({ id: job.id, code: error.code || 'AI_GENERATION_FAILED', reason: error.message || 'AI generation failed.' });
        }
        return this.repository.findJob(job.userId, job.id);
    }

    async processPendingJobs(limit = 5) {
        const safeLimit = Number.isSafeInteger(limit) && limit > 0 && limit <= 20 ? limit : 5;
        const jobIds = await this.repository.listQueuedJobIds(safeLimit, this.now());
        const settled = await Promise.allSettled(jobIds.map((jobId) => this.processGenerationJob(jobId)));
        return {
            scanned: jobIds.length,
            processed: settled.filter((result) => result.status === 'fulfilled' && result.value).length,
            failed: settled.filter((result) => result.status === 'rejected').length
        };
    }

    async saveOutfit(userId, { outfitResultId, name, tags, memo } = {}) {
        const result = await this.repository.findResult(userId, positiveId(outfitResultId, 'outfitResultId'));
        if (!result) throw httpError(404, 'NOT_FOUND404', 'Outfit result was not found.');
        if (isResultExpired(result, this.now())) throw httpError(404, 'NOT_FOUND404', 'Outfit result is no longer available.');
        try {
            return toSaved(await this.repository.saveResult({
                userId, outfitResultId: result.id,
                name: normalizeText(name, `${this.now().toISOString().slice(0, 10)} outfit`, 20, 'name'),
                tags: normalizeTags(tags),
                memo: normalizeText(memo, null, 200, 'memo')
            }));
        } catch (error) {
            if (error.code === 'P2002') throw httpError(409, 'CONFLICT409', 'Outfit result is already saved.');
            throw error;
        }
    }

    async getSavedOutfits(userId, query) {
        const { page, size } = pagination(query);
        const [items, totalCount] = await this.repository.listSaved(userId, (page - 1) * size, size, false);
        return { items: items.map(toSaved), pagination: { page, size, totalCount } };
    }

    async getDeletedSavedOutfits(userId, query) {
        const { page, size } = pagination(query);
        const [items, totalCount] = await this.repository.listSaved(userId, (page - 1) * size, size, true);
        return { items: items.map(toSaved), pagination: { page, size, totalCount } };
    }

    async getSavedOutfit(userId, rawId) {
        const saved = await this.repository.findSaved(userId, positiveId(rawId, 'savedOutfitId'));
        if (!saved) throw httpError(404, 'NOT_FOUND404', 'Saved outfit was not found.');
        return toSaved(saved);
    }

    async updateSavedOutfit(userId, rawId, input = {}) {
        const data = {};
        if (input.name !== undefined) data.name = normalizeText(input.name, `${this.now().toISOString().slice(0, 10)} outfit`, 20, 'name');
        if (input.tags !== undefined) data.tags = normalizeTags(input.tags);
        if (input.memo !== undefined) data.memo = normalizeText(input.memo, null, 200, 'memo');
        if (Object.keys(data).length === 0) throw httpError(400, 'REQUEST400', 'At least one editable field is required.');
        const saved = await this.repository.updateSaved(userId, positiveId(rawId, 'savedOutfitId'), data);
        if (!saved) throw httpError(404, 'NOT_FOUND404', 'Saved outfit was not found.');
        return toSaved(saved);
    }

    async deleteSavedOutfit(userId, rawId) {
        const savedOutfitId = positiveId(rawId, 'savedOutfitId');
        const deletedAt = this.now();
        const changed = await this.repository.softDeleteSaved(userId, savedOutfitId, deletedAt);
        if (changed.count !== 1) throw httpError(404, 'NOT_FOUND404', 'Saved outfit was not found.');
        return { savedOutfitId, deletedAt };
    }

    async restoreSavedOutfit(userId, rawId) {
        const savedOutfitId = positiveId(rawId, 'savedOutfitId');
        const restoredAt = this.now();
        const changed = await this.repository.restoreSaved(userId, savedOutfitId);
        if (changed.count !== 1) throw httpError(404, 'NOT_FOUND404', 'Deleted saved outfit was not found.');
        return { savedOutfitId, deletedAt: null, restoredAt };
    }

    async permanentlyDeleteSavedOutfit(userId, rawId) {
        const changed = await this.repository.permanentDeleteSaved(userId, positiveId(rawId, 'savedOutfitId'));
        if (changed.count !== 1) throw httpError(404, 'NOT_FOUND404', 'Deleted saved outfit was not found.');
        return null;
    }
}
