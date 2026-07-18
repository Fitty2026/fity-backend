import { normalizeAiRequestMode, requestAiOutfitGeneration } from "./outfit-ai.service.js";

const MAX_PAGE_SIZE = 50;

const bodyProfiles = [
    { bodyProfileId: 1, userId: 1 },
    { bodyProfileId: 2, userId: 2 }
];

const closetItems = [
    { closetItemId: 3, userId: 1, name: "white shirt", imageUrl: "https://fitty-bucket.s3.amazonaws.com/closet/item_3.png" },
    { closetItemId: 7, userId: 1, name: "denim pants", imageUrl: "https://fitty-bucket.s3.amazonaws.com/closet/item_7.png" },
    { closetItemId: 12, userId: 1, name: "black jacket", imageUrl: "https://fitty-bucket.s3.amazonaws.com/closet/item_12.png" },
    { closetItemId: 20, userId: 2, name: "other user item", imageUrl: "https://fitty-bucket.s3.amazonaws.com/closet/item_20.png" }
];

const styleTags = [
    { styleTagId: 1, name: "casual" },
    { styleTagId: 3, name: "street" }
];

const outfitResults = [
    {
        outfitResultId: 10,
        userId: 1,
        generatedImageUrl: "https://fitty-bucket.s3.amazonaws.com/outfits/outfit_10.png",
        fallbackUsed: false,
        provider: "fitty-ai",
        failureReason: null,
        recommendedClosetItemIds: [3, 7, 12],
        closetItemIds: [3, 7, 12]
    }
];

const outfitJobs = [
    {
        jobId: 1,
        userId: 1,
        status: "completed",
        bodyProfileId: 1,
        closetItemIds: [3, 7, 12],
        styleTagIds: [1, 3],
        aiRequestMode: "SUCCESS",
        outfitResultId: 10,
        createdAt: "2026-07-18T20:30:00.000Z",
        completedAt: "2026-07-18T20:31:30.000Z"
    }
];

const savedOutfits = [
    {
        savedOutfitId: 1,
        userId: 1,
        outfitResultId: 10,
        name: "daily outfit",
        imageUrl: "https://fitty-bucket.s3.amazonaws.com/outfits/outfit_10.png",
        thumbnailUrl: "https://fitty-bucket.s3.amazonaws.com/outfits/outfit_10.png",
        savedAt: "2026-07-18T20:40:00.000Z"
    }
];

let nextJobId = 2;
let nextOutfitResultId = 11;
let nextSavedOutfitId = 2;

const createHttpError = (status, code, message) => {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    return error;
};

const findOwnedBodyProfile = (userId, bodyProfileId) => (
    bodyProfiles.find((item) => item.bodyProfileId === Number(bodyProfileId) && item.userId === userId)
);

const findOwnedClosetItems = (userId, closetItemIds) => (
    closetItems.filter((item) => item.userId === userId && closetItemIds.includes(item.closetItemId))
);

const findStyleTags = (styleTagIds) => (
    styleTags.filter((item) => styleTagIds.includes(item.styleTagId))
);

const assertGenerationOwnership = ({ userId, bodyProfileId, closetItemIds, styleTagIds }) => {
    if (!bodyProfileId) {
        throw createHttpError(400, "REQUEST400", "bodyProfileId is required.");
    }

    if (!Array.isArray(closetItemIds) || closetItemIds.length === 0) {
        throw createHttpError(400, "REQUEST400", "At least one closet item is required.");
    }

    if (!findOwnedBodyProfile(userId, bodyProfileId)) {
        throw createHttpError(404, "NOT_FOUND404", "Body profile was not found.");
    }

    const normalizedClosetItemIds = closetItemIds.map(Number);
    const ownedItems = findOwnedClosetItems(userId, normalizedClosetItemIds);

    if (ownedItems.length !== normalizedClosetItemIds.length) {
        throw createHttpError(403, "FORBIDDEN403", "Closet item ownership check failed.");
    }

    const normalizedStyleTagIds = Array.isArray(styleTagIds) ? styleTagIds.map(Number) : [];
    const matchedTags = findStyleTags(normalizedStyleTagIds);

    if (matchedTags.length !== normalizedStyleTagIds.length) {
        throw createHttpError(400, "REQUEST400", "Invalid style tag is included.");
    }

    return {
        closetItemIds: normalizedClosetItemIds,
        styleTagIds: normalizedStyleTagIds
    };
};

const completeJobIfReady = async (job) => {
    if (job.status !== "queued") {
        return job;
    }

    job.status = "processing";
    const aiResult = await requestAiOutfitGeneration({
        jobId: job.jobId,
        closetItemIds: job.closetItemIds,
        aiRequestMode: job.aiRequestMode
    });

    const outfitResult = {
        outfitResultId: nextOutfitResultId++,
        userId: job.userId,
        generatedImageUrl: aiResult.generatedImageUrl,
        fallbackUsed: aiResult.fallbackUsed,
        provider: aiResult.provider,
        failureReason: aiResult.failureReason,
        recommendedClosetItemIds: aiResult.recommendedClosetItemIds,
        closetItemIds: job.closetItemIds
    };

    outfitResults.push(outfitResult);
    job.status = "completed";
    job.outfitResultId = outfitResult.outfitResultId;
    job.completedAt = new Date().toISOString();

    return job;
};

const getOwnedOutfitResult = (userId, outfitResultId) => {
    const result = outfitResults.find((item) => item.outfitResultId === Number(outfitResultId));

    if (!result) {
        throw createHttpError(404, "NOT_FOUND404", "Outfit result was not found.");
    }

    if (result.userId !== userId) {
        throw createHttpError(403, "FORBIDDEN403", "Outfit result ownership check failed.");
    }

    return result;
};

const getClosetItemSummary = (closetItemId) => {
    const item = closetItems.find((closetItem) => closetItem.closetItemId === closetItemId);

    return item
        ? {
            id: item.closetItemId,
            closetItemId: item.closetItemId,
            name: item.name,
            imageUrl: item.imageUrl
        }
        : null;
};

const getStyleTagSummary = (styleTagId) => {
    const tag = styleTags.find((styleTag) => styleTag.styleTagId === styleTagId);

    return tag
        ? {
            id: tag.styleTagId,
            styleTagId: tag.styleTagId,
            name: tag.name
        }
        : null;
};

const toSavedOutfitResponse = (savedOutfit) => {
    const sourceResult = outfitResults.find((item) => item.outfitResultId === savedOutfit.outfitResultId);
    const sourceJob = outfitJobs.find((item) => item.outfitResultId === savedOutfit.outfitResultId);

    return {
        id: savedOutfit.savedOutfitId,
        savedOutfitId: savedOutfit.savedOutfitId,
        outfitResultId: savedOutfit.outfitResultId,
        name: savedOutfit.name,
        imageUrl: savedOutfit.imageUrl,
        thumbnailUrl: savedOutfit.thumbnailUrl,
        items: (sourceResult?.closetItemIds || [])
            .map(getClosetItemSummary)
            .filter(Boolean),
        styleTags: (sourceJob?.styleTagIds || [])
            .map(getStyleTagSummary)
            .filter(Boolean),
        createdAt: savedOutfit.savedAt,
        savedAt: savedOutfit.savedAt,
        isSaved: true
    };
};

const parsePagination = ({ page = 1, size = 10 }) => {
    const currentPage = Number(page);
    const pageSize = Number(size);

    if (
        !Number.isSafeInteger(currentPage)
        || !Number.isSafeInteger(pageSize)
        || currentPage < 1
        || pageSize < 1
        || pageSize > MAX_PAGE_SIZE
    ) {
        throw createHttpError(400, "REQUEST400", "Invalid pagination value.");
    }

    return { currentPage, pageSize };
};

export const createGenerationJob = async (userId, { bodyProfileId, closetItemIds, styleTagIds, aiRequestMode }) => {
    const normalizedInput = assertGenerationOwnership({
        userId,
        bodyProfileId,
        closetItemIds,
        styleTagIds
    });

    const now = new Date().toISOString();
    const job = {
        jobId: nextJobId++,
        userId,
        status: "queued",
        bodyProfileId: Number(bodyProfileId),
        closetItemIds: normalizedInput.closetItemIds,
        styleTagIds: normalizedInput.styleTagIds,
        aiRequestMode: normalizeAiRequestMode(aiRequestMode),
        outfitResultId: null,
        createdAt: now,
        completedAt: null
    };

    outfitJobs.push(job);

    return {
        jobId: job.jobId,
        status: job.status,
        createdAt: job.createdAt
    };
};

export const getGenerationJob = async (userId, jobId) => {
    const job = outfitJobs.find((item) => item.jobId === Number(jobId));

    if (!job) {
        throw createHttpError(404, "NOT_FOUND404", "Outfit generation job was not found.");
    }

    if (job.userId !== userId) {
        throw createHttpError(403, "FORBIDDEN403", "Outfit generation job ownership check failed.");
    }

    const completedJob = await completeJobIfReady(job);
    const result = completedJob.outfitResultId
        ? getOwnedOutfitResult(userId, completedJob.outfitResultId)
        : null;

    return {
        jobId: completedJob.jobId,
        status: completedJob.status,
        outfitResultId: completedJob.outfitResultId,
        generatedImage: result
            ? {
                outfitResultId: result.outfitResultId,
                imageUrl: result.generatedImageUrl,
                provider: result.provider,
                fallbackUsed: result.fallbackUsed,
                failureReason: result.failureReason,
                recommendedClosetItemIds: result.recommendedClosetItemIds
            }
            : null,
        createdAt: completedJob.createdAt,
        completedAt: completedJob.completedAt
    };
};

export const saveOutfit = async (userId, { outfitResultId, name }) => {
    if (!outfitResultId) {
        throw createHttpError(400, "REQUEST400", "outfitResultId is required.");
    }

    const sourceResult = getOwnedOutfitResult(userId, outfitResultId);

    const alreadySaved = savedOutfits.some((item) => (
        item.userId === userId && item.outfitResultId === sourceResult.outfitResultId
    ));

    if (alreadySaved) {
        throw createHttpError(400, "REQUEST400", "Outfit result is already saved.");
    }

    const savedOutfit = {
        savedOutfitId: nextSavedOutfitId++,
        userId,
        outfitResultId: sourceResult.outfitResultId,
        name: name || "saved outfit",
        imageUrl: sourceResult.generatedImageUrl,
        thumbnailUrl: sourceResult.generatedImageUrl,
        savedAt: new Date().toISOString()
    };

    savedOutfits.push(savedOutfit);

    return toSavedOutfitResponse(savedOutfit);
};

export const getSavedOutfits = async (userId, pagination) => {
    const { currentPage, pageSize } = parsePagination(pagination);
    const ownedSavedOutfits = savedOutfits.filter((item) => item.userId === userId);
    const startIndex = (currentPage - 1) * pageSize;
    const pagedItems = ownedSavedOutfits.slice(startIndex, startIndex + pageSize);

    return {
        items: pagedItems.map(toSavedOutfitResponse),
        pagination: {
            page: currentPage,
            size: pageSize,
            totalCount: ownedSavedOutfits.length
        }
    };
};

export const deleteSavedOutfit = async (userId, savedOutfitId) => {
    const targetIndex = savedOutfits.findIndex((item) => item.savedOutfitId === Number(savedOutfitId));

    if (targetIndex === -1) {
        throw createHttpError(404, "NOT_FOUND404", "Saved outfit was not found.");
    }

    if (savedOutfits[targetIndex].userId !== userId) {
        throw createHttpError(403, "FORBIDDEN403", "Saved outfit ownership check failed.");
    }

    savedOutfits.splice(targetIndex, 1);
    return null;
};

export const resetOutfitStoreForTest = () => {
    outfitJobs.splice(1);
    outfitResults.splice(1);
    savedOutfits.splice(1);
    nextJobId = 2;
    nextOutfitResultId = 11;
    nextSavedOutfitId = 2;
};
