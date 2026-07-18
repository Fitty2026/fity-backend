export const AI_REQUEST_MODES = {
    SUCCESS: "SUCCESS",
    FALLBACK: "FALLBACK"
};

export const normalizeAiRequestMode = (mode) => {
    if (!mode) {
        return AI_REQUEST_MODES.SUCCESS;
    }

    const normalizedMode = String(mode).toUpperCase();

    if (!Object.values(AI_REQUEST_MODES).includes(normalizedMode)) {
        return AI_REQUEST_MODES.SUCCESS;
    }

    return normalizedMode;
};

export const requestAiOutfitGeneration = async ({ jobId, closetItemIds, aiRequestMode }) => {
    if (aiRequestMode === AI_REQUEST_MODES.FALLBACK) {
        return {
            provider: "fallback",
            fallbackUsed: true,
            failureReason: "AI generation is unavailable in the current skeleton flow.",
            generatedImageUrl: "https://fitty-bucket.s3.amazonaws.com/outfits/fallback_outfit.png",
            recommendedClosetItemIds: closetItemIds.slice(0, 3)
        };
    }

    return {
        provider: "fitty-ai",
        fallbackUsed: false,
        failureReason: null,
        generatedImageUrl: `https://fitty-bucket.s3.amazonaws.com/outfits/outfit_${jobId}.png`,
        recommendedClosetItemIds: closetItemIds.slice(0, 3)
    };
};
