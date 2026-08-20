const httpError = (status, code, message) => Object.assign(new Error(message), { status, code });
const ACTIVE_STATUSES = new Set(['QUEUED', 'PROCESSING', 'QC_PENDING']);
const SITUATIONS = new Set(['DATE', 'WORK', 'SCHOOL', 'TRAVEL']);
const WEATHER_CONDITIONS = new Set(['SUNNY', 'CLOUDY', 'RAINY', 'SNOWY', 'WINDY', 'UNKNOWN']);
const JOB_TTL_MS = 10 * 60 * 1000;
const RESULT_TTL_MS = 24 * 60 * 60 * 1000;
const DELETED_OUTFIT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const INPUT_SCHEMA_VERSION = 'outfit-input-v1';
const DEFAULT_OUTFIT_GENERATION_PUZZLE_COST = 10;
const IMAGE_CONTENT_PATH = /^\/api\/v1\/images\/(\d+)\/content(?:\?.*)?$/;
const presentImageUrl = (imageUrl, imageUrlSigner) => {
    if (!imageUrlSigner || typeof imageUrl !== 'string') return imageUrl;
    const match = imageUrl.match(IMAGE_CONTENT_PATH);
    return match ? imageUrlSigner.createSignedUrl(Number(match[1])) : imageUrl;
};
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

const normalizeIdempotencyKey = (value) => {
    if (value == null) return null;
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 128) {
        throw httpError(400, 'REQUEST400', 'Idempotency-Key must be a non-empty string of 128 characters or fewer.');
    }
    return value.trim();
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

const assertSingleItemPerCoreCategory = (items) => {
    const coreCategories = new Set(['TOP', 'BOTTOM', 'SHOES']);
    const selectedCategories = new Set();

    for (const item of items) {
        if (!coreCategories.has(item.category)) continue;
        if (selectedCategories.has(item.category)) {
            throw httpError(400, 'REQUEST400', `${item.category} can contain only one selected item.`);
        }
        selectedCategories.add(item.category);
    }
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

const DEFAULT_FALLBACK_IMAGE_URLS = [
    '/fallback/mock-outfit-preview.jpg',
    '/fallback/mock-outfit-leather.jpg',
    '/fallback/mock-outfit-cardigan.jpg',
    '/fallback/mock-outfit-striped.jpg',
    '/fallback/mock-outfit-gray-knit.jpg'
];
const DEFAULT_FALLBACK_IMAGE_URL = DEFAULT_FALLBACK_IMAGE_URLS[0];
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
    modelVersion: 'fallback-v1',
    promptVersion: null,
    outfitItems: null,
    fallbackUsed: true
});

const toClosetItemSnapshot = (item) => ({
    itemId: item.id,
    category: item.category,
    tags: (item.tags ?? []).map((tag) => tag.tagName),
    imageRef: {
        assetId: item.imageAsset?.id ?? item.imageId,
        contentPath: `/api/v1/images/${item.imageAsset?.id ?? item.imageId}/content`,
        mimeType: item.imageAsset?.mimeType ?? null
    }
});

const createInputSnapshot = ({ bodyProfile, selectedItems, closetItemPool, stylePreferences }, input) => ({
    schemaVersion: INPUT_SCHEMA_VERSION,
    bodyProfile: {
        id: bodyProfile.id,
        bodyBalance: bodyProfile.bodyBalance ?? null,
        shoulderWidth: bodyProfile.shoulderWidth ?? null,
        frameSize: bodyProfile.frameSize ?? null
    },
    stylePreferences: stylePreferences.map(({ id, code, name }) => ({ styleTagId: id, code, name })),
    selectedItems: selectedItems.map(toClosetItemSnapshot),
    closetItemPool: closetItemPool.map(toClosetItemSnapshot),
    moodContext: input.situation ? { type: input.situation } : null,
    selectedDate: input.selectedDate,
    weatherContext: input.weather
});

const jobInput = (job) => ({
    closetItemIds: job.closetItemIds,
    styleTagIds: job.styleTagIds,
    situation: job.situation ?? null,
    selectedDate: job.selectedDate ? new Date(job.selectedDate).toISOString().slice(0, 10) : null,
    weather: job.weather ?? null
});

const sameJson = (left, right) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
const sameIds = (left, right) => sameJson(
    [...(left ?? [])].sort((a, b) => a - b),
    [...(right ?? [])].sort((a, b) => a - b)
);
const matchesGenerationInput = (job, input) => sameIds(job.closetItemIds, input.closetItemIds)
    && sameIds(job.styleTagIds, input.styleTagIds)
    && (job.situation ?? null) === input.situation
    && (job.selectedDate ? new Date(job.selectedDate).toISOString().slice(0, 10) : null) === input.selectedDate
    && sameJson(job.weather, input.weather);

const toJob = (job, { isExistingJob, includeInput = false, includeResult = true, imageUrlSigner } = {}) => ({
    jobId: job.id,
    status: job.status.toLowerCase(),
    progress: job.progress,
    inputSchemaVersion: job.inputSchemaVersion ?? INPUT_SCHEMA_VERSION,
    ...(isExistingJob === undefined ? {} : { isExistingJob }),
    ...(includeInput ? { input: jobInput(job) } : {}),
    expiresAt: job.expiresAt,
    ...(includeResult ? { outfitResultId: job.status === 'EXPIRED' ? null : job.result?.id ?? null } : {}),
    ...(includeResult ? {
        generatedImageUrl: job.result && job.status !== 'EXPIRED'
            ? presentImageUrl(job.result.generatedImageUrl, imageUrlSigner)
            : null
    } : {}),
    ...(includeResult ? { generatedImage: job.result && job.status !== 'EXPIRED' ? {
        outfitResultId: job.result.id,
        imageUrl: presentImageUrl(job.result.generatedImageUrl, imageUrlSigner),
        provider: job.result.provider,
        modelVersion: job.result.modelVersion,
        promptVersion: job.result.promptVersion ?? null,
        fallbackUsed: job.result.fallbackUsed,
        outfitItems: job.result.outfitItems ?? null,
        recommendedClosetItemIds: job.result.recommendedClosetItemIds
    } : null } : {}),
    ...(includeResult ? { failure: ['FAILED', 'EXPIRED'].includes(job.status) ? { code: job.failureCode, message: job.failureReason } : null } : {}),
    createdAt: job.createdAt,
    completedAt: job.completedAt
});

const toRevision = (job, revision) => ({
    revisionId: revision.id,
    jobId: job.id,
    parentOutfitResultId: revision.sourceOutfitResultId,
    status: job.status.toLowerCase(),
    progress: job.progress,
    createdAt: job.createdAt,
    expiresAt: job.expiresAt
});

const toSaved = (saved, imageUrlSigner, now = new Date()) => ({
    id: saved.id,
    savedOutfitId: saved.id,
    outfitResultId: saved.outfitResultId,
    name: saved.name,
    imageUrl: presentImageUrl(saved.outfitResult.generatedImageUrl, imageUrlSigner),
    modelVersion: saved.outfitResult.modelVersion,
    promptVersion: saved.outfitResult.promptVersion ?? null,
    items: saved.outfitResult.recommendedClosetItemIds,
    outfitItems: saved.outfitResult.outfitItems ?? null,
    styleTags: saved.outfitResult.generationJob?.styleTagIds ?? [],
    tags: saved.tags,
    memo: saved.memo,
    createdAt: saved.createdAt,
    updatedAt: saved.updatedAt,
    deletedAt: saved.deletedAt,
    ...(saved.deletedAt ? {
        deletionDaysRemaining: Math.max(0, Math.ceil(
            (new Date(saved.deletedAt).getTime() + DELETED_OUTFIT_TTL_MS - now.getTime()) / (24 * 60 * 60 * 1000)
        ))
    } : {}),
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
    constructor({
        repository,
        aiAdapter,
        fallbackImageUrl,
        fallbackImageUrls = fallbackImageUrl
            ? [fallbackImageUrl]
            : process.env.FALLBACK_OUTFIT_IMAGE_URLS?.split(',') ?? DEFAULT_FALLBACK_IMAGE_URLS,
        puzzleCost = Number(process.env.OUTFIT_GENERATION_PUZZLE_COST ?? DEFAULT_OUTFIT_GENERATION_PUZZLE_COST),
        imageUrlSigner,
        now = () => new Date()
    }) {
        if (!Number.isSafeInteger(puzzleCost) || puzzleCost <= 0) {
            throw new TypeError('puzzleCost must be a positive safe integer.');
        }
        this.repository = repository;
        this.aiAdapter = aiAdapter;
        this.fallbackImageUrls = [...new Set(fallbackImageUrls.map(normalizeFallbackImageUrl))];
        this.puzzleCost = puzzleCost;
        this.imageUrlSigner = imageUrlSigner;
        this.now = now;
    }

    toJob(job, options = {}) {
        return toJob(job, { ...options, imageUrlSigner: this.imageUrlSigner });
    }

    toSaved(saved) {
        return toSaved(saved, this.imageUrlSigner, this.now());
    }

    fallbackImageUrlFor(jobId) {
        const index = Number.isSafeInteger(jobId) && jobId > 0
            ? (jobId - 1) % this.fallbackImageUrls.length
            : 0;
        return this.fallbackImageUrls[index];
    }

    async createGenerationJob(userId, input = {}, rawIdempotencyKey) {
        const idempotencyKey = normalizeIdempotencyKey(rawIdempotencyKey);
        const closetItemIds = normalizeIds(input.closetItemIds, 'closetItemIds', { required: true, maximum: 3 });
        let styleTagIds = input.styleTagIds == null ? null : normalizeIds(input.styleTagIds, 'styleTagIds');
        const situation = normalizeOptionalEnum(input.situation, 'situation', SITUATIONS);
        const selectedDate = normalizeSelectedDate(input.selectedDate);
        const weather = normalizeWeather(input.weather);
        const existing = idempotencyKey
            ? await this.repository.findJobByIdempotencyKey(userId, idempotencyKey)
            : null;
        if (existing && styleTagIds === null) styleTagIds = existing.styleTagIds;
        if (styleTagIds === null) styleTagIds = await this.repository.findOwnedStyleTagIds(userId, null);
        const normalizedInput = {
            closetItemIds,
            styleTagIds,
            situation,
            selectedDate: selectedDate ? selectedDate.toISOString().slice(0, 10) : null,
            weather
        };
        if (existing) {
            if (!matchesGenerationInput(existing, normalizedInput)) {
                throw httpError(409, 'CONFLICT409', 'Idempotency-Key was already used with a different outfit request.');
            }
            return this.toJob(existing, { isExistingJob: true, includeInput: true, includeResult: false });
        }
        const ownedItemIds = await this.repository.findOwnedClosetItemIds(userId, closetItemIds);
        if (ownedItemIds.length !== closetItemIds.length) throw httpError(403, 'FORBIDDEN403', 'Closet item ownership check failed.');
        if (styleTagIds.length > 0) {
            const ownedStyleTagIds = await this.repository.findOwnedStyleTagIds(userId, styleTagIds);
            if (ownedStyleTagIds.length !== styleTagIds.length) throw httpError(404, 'NOT_FOUND404', 'Style preference was not found.');
        }
        const context = await this.repository.findGenerationContext(userId, closetItemIds, styleTagIds);
        if (!context.bodyProfile) throw httpError(404, 'NOT_FOUND404', 'Active body profile was not found.');
        if (context.selectedItems.length !== closetItemIds.length) {
            throw httpError(403, 'FORBIDDEN403', 'Closet item is not active or its image is unavailable.');
        }
        assertSingleItemPerCoreCategory(context.selectedItems);
        if (context.stylePreferences.length !== styleTagIds.length) {
            throw httpError(404, 'NOT_FOUND404', 'Style preference was not found.');
        }
        const inputSnapshot = createInputSnapshot(context, normalizedInput);
        const now = this.now();
        const jobData = {
            userId, idempotencyKey, inputSchemaVersion: INPUT_SCHEMA_VERSION,
            bodyProfileId: context.bodyProfile.id, closetItemIds, styleTagIds, situation,
            selectedDate, weather, inputSnapshot, progress: 5, expiresAt: new Date(now.getTime() + JOB_TTL_MS)
        };
        let created;
        for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
                created = await this.repository.createOrFindActiveJob(jobData, now, { amount: this.puzzleCost });
                break;
            } catch (error) {
                if (error.code === 'P2002' && idempotencyKey) {
                    const existing = await this.repository.findJobByIdempotencyKey(userId, idempotencyKey);
                    if (existing && matchesGenerationInput(existing, normalizedInput)) {
                        created = { job: existing, isExistingJob: true };
                        break;
                    }
                    if (existing) {
                        throw httpError(409, 'CONFLICT409', 'Idempotency-Key was already used with a different outfit request.');
                    }
                }
                if (error.code !== 'P2034' || attempt === 2) throw error;
            }
        }
        const { job, isExistingJob } = created;
        return this.toJob(job, { isExistingJob, includeInput: true, includeResult: false });
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
        return this.toJob(job);
    }

    async getActiveGenerationJob(userId) {
        const now = this.now();
        await this.repository.expireStaleActiveJobs(userId, now);
        const activeJob = await this.repository.findActiveJob(userId, now);
        if (activeJob) {
            return this.toJob(activeJob, { isExistingJob: true, includeInput: true, includeResult: false });
        }

        // A loading-page refresh loses its route state. Return the latest still-valid
        // completed result so the client can poll it once and resume the result screen.
        const resumableJob = await this.repository.findLatestResumableJob(
            userId,
            new Date(now.getTime() - RESULT_TTL_MS)
        );
        return resumableJob ? this.toJob(resumableJob, { isExistingJob: true, includeInput: true }) : null;
    }

    async createRevision(userId, rawResultId, input = {}, rawIdempotencyKey) {
        const idempotencyKey = normalizeIdempotencyKey(rawIdempotencyKey);
        const outfitResultId = positiveId(rawResultId, 'outfitResultId');
        const replaceItemId = positiveId(input.replaceItemId, 'replaceItemId');
        const newItemId = positiveId(input.newItemId, 'newItemId');
        if (replaceItemId === newItemId) throw httpError(400, 'REQUEST400', 'replaceItemId and newItemId must be different.');
        if (idempotencyKey) {
            const existing = await this.repository.findJobByIdempotencyKey(userId, idempotencyKey);
            if (existing) {
                const revision = existing.revision;
                if (!revision || revision.sourceOutfitResultId !== outfitResultId
                    || revision.replaceItemId !== replaceItemId || revision.newItemId !== newItemId) {
                    throw httpError(409, 'CONFLICT409', 'Idempotency-Key was already used with a different outfit request.');
                }
                return toRevision(existing, revision);
            }
        }
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
        const normalizedInput = {
            closetItemIds,
            styleTagIds: source.generationJob.styleTagIds,
            situation: source.generationJob.situation ?? null,
            selectedDate: source.generationJob.selectedDate
                ? new Date(source.generationJob.selectedDate).toISOString().slice(0, 10)
                : null,
            weather: source.generationJob.weather ?? null
        };
        const context = await this.repository.findGenerationContext(userId, closetItemIds, normalizedInput.styleTagIds);
        if (!context.bodyProfile) throw httpError(404, 'NOT_FOUND404', 'Active body profile was not found.');
        if (context.selectedItems.length !== closetItemIds.length) {
            throw httpError(409, 'ITEM_NOT_COMPATIBLE', 'Every item in the revised outfit must still be active and available.');
        }
        const inputSnapshot = createInputSnapshot(context, normalizedInput);
        let created;
        try {
            created = await this.repository.createRevisionJob({
                revision: { userId, sourceOutfitResultId: source.id, replaceItemId, newItemId },
                job: {
                    userId, idempotencyKey, inputSchemaVersion: INPUT_SCHEMA_VERSION,
                    bodyProfileId: context.bodyProfile.id, closetItemIds,
                    styleTagIds: source.generationJob.styleTagIds, situation: source.generationJob.situation,
                    selectedDate: source.generationJob.selectedDate, weather: source.generationJob.weather,
                    inputSnapshot, progress: 5, expiresAt: new Date(now.getTime() + JOB_TTL_MS)
                }
            }, now);
        } catch (error) {
            if (error.code === 'P2002' && idempotencyKey) {
                const existing = await this.repository.findJobByIdempotencyKey(userId, idempotencyKey);
                if (existing?.revision && existing.revision.sourceOutfitResultId === outfitResultId
                    && existing.revision.replaceItemId === replaceItemId && existing.revision.newItemId === newItemId) {
                    return toRevision(existing, existing.revision);
                }
                if (existing) {
                    throw httpError(409, 'CONFLICT409', 'Idempotency-Key was already used with a different outfit request.');
                }
            }
            if (error.code === 'ACTIVE_JOB_EXISTS' || error.code === 'P2034') {
                throw httpError(409, 'CONFLICT409', 'An outfit generation job is already in progress.');
            }
            throw error;
        }
        const { job, revision } = created;
        return toRevision(job, revision);
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
                    inputSchemaVersion: job.inputSchemaVersion,
                    inputSnapshot: job.inputSnapshot,
                    situation: job.situation,
                    selectedDate: job.selectedDate ? new Date(job.selectedDate).toISOString().slice(0, 10) : null,
                    weather: job.weather
                });
                const poolItems = job.inputSnapshot?.closetItemPool ?? [];
                const poolCategories = new Map(poolItems.map((item) => [item.itemId, item.category]));
                if (poolCategories.size > 0
                    && result.recommendedClosetItemIds.some((itemId) => !poolCategories.has(itemId))) {
                    throw Object.assign(new Error('AI recommended an item outside the generation snapshot.'), { code: 'AI_INVALID_RECOMMENDATION' });
                }
                if (result.outfitItems) {
                    const categories = result.outfitItems.map((item) => poolCategories.get(item.itemId)).filter(Boolean);
                    if (new Set(categories).size !== categories.length) {
                        throw Object.assign(new Error('AI recommended duplicate outfit categories.'), { code: 'AI_INVALID_RECOMMENDATION' });
                    }
                }
                const ownedRecommendationIds = await this.repository.findOwnedClosetItemIds(job.userId, result.recommendedClosetItemIds);
                if (ownedRecommendationIds.length !== result.recommendedClosetItemIds.length) {
                    throw Object.assign(new Error('AI recommended an inaccessible closet item.'), { code: 'AI_INVALID_RECOMMENDATION' });
                }
            } catch {
                result = createFallbackResult(job, this.fallbackImageUrlFor(job.id));
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

    async cleanupExpiredJobs() {
        const now = this.now();
        const cutoff = new Date(now.getTime() - RESULT_TTL_MS);
        const deletedOutfitCutoff = new Date(now.getTime() - DELETED_OUTFIT_TTL_MS);
        const [staleJobs, expiredResults, expiredDeletedOutfits] = await Promise.all([
            this.repository.expireAllStaleActiveJobs(now),
            this.repository.expireAllCompletedJobs(cutoff),
            this.repository.purgeDeletedSavedOutfits(deletedOutfitCutoff)
        ]);
        return {
            staleJobs: staleJobs.count,
            expiredResults: expiredResults.count,
            expiredDeletedOutfits: expiredDeletedOutfits.count
        };
    }

    async saveOutfit(userId, { outfitResultId, name, tags, memo } = {}) {
        const result = await this.repository.findResult(userId, positiveId(outfitResultId, 'outfitResultId'));
        if (!result) throw httpError(404, 'NOT_FOUND404', 'Outfit result was not found.');
        if (isResultExpired(result, this.now())) throw httpError(404, 'NOT_FOUND404', 'Outfit result is no longer available.');
        try {
            return this.toSaved(await this.repository.saveResult({
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
        return { items: items.map((item) => this.toSaved(item)), pagination: { page, size, totalCount } };
    }

    async getDeletedSavedOutfits(userId, query) {
        const { page, size } = pagination(query);
        await this.repository.purgeDeletedSavedOutfits(
            new Date(this.now().getTime() - DELETED_OUTFIT_TTL_MS)
        );
        const [items, totalCount] = await this.repository.listSaved(userId, (page - 1) * size, size, true);
        return { items: items.map((item) => this.toSaved(item)), pagination: { page, size, totalCount } };
    }

    async getSavedOutfit(userId, rawId) {
        const saved = await this.repository.findSaved(userId, positiveId(rawId, 'savedOutfitId'));
        if (!saved) throw httpError(404, 'NOT_FOUND404', 'Saved outfit was not found.');
        return this.toSaved(saved);
    }

    async updateSavedOutfit(userId, rawId, input = {}) {
        const data = {};
        if (input.name !== undefined) data.name = normalizeText(input.name, `${this.now().toISOString().slice(0, 10)} outfit`, 20, 'name');
        if (input.tags !== undefined) data.tags = normalizeTags(input.tags);
        if (input.memo !== undefined) data.memo = normalizeText(input.memo, null, 200, 'memo');
        if (Object.keys(data).length === 0) throw httpError(400, 'REQUEST400', 'At least one editable field is required.');
        const saved = await this.repository.updateSaved(userId, positiveId(rawId, 'savedOutfitId'), data);
        if (!saved) throw httpError(404, 'NOT_FOUND404', 'Saved outfit was not found.');
        return this.toSaved(saved);
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
        const changed = await this.repository.restoreSaved(
            userId,
            savedOutfitId,
            new Date(restoredAt.getTime() - DELETED_OUTFIT_TTL_MS)
        );
        if (changed.count !== 1) throw httpError(404, 'NOT_FOUND404', 'Deleted saved outfit was not found.');
        return { savedOutfitId, deletedAt: null, restoredAt };
    }

    async permanentlyDeleteSavedOutfit(userId, rawId) {
        const changed = await this.repository.permanentDeleteSaved(userId, positiveId(rawId, 'savedOutfitId'));
        if (changed.count !== 1) throw httpError(404, 'NOT_FOUND404', 'Deleted saved outfit was not found.');
        return null;
    }
}
