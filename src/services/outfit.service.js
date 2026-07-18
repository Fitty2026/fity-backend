const outfitJobs = [
    {
        jobId: 1,
        userId: 1,
        status: "completed",
        outfitResultId: 10,
        generatedImageUrl: "https://fitty-bucket.s3.amazonaws.com/outfits/outfit_10.png",
        createdAt: "2026-07-18T20:30:00.000Z",
        completedAt: "2026-07-18T20:31:30.000Z"
    }
];

const savedOutfits = [
    {
        savedOutfitId: 1,
        userId: 1,
        outfitResultId: 10,
        name: "월요일 데일리 코디",
        thumbnailUrl: "https://fitty-bucket.s3.amazonaws.com/outfits/outfit_10.png",
        savedAt: "2026-07-18T20:40:00.000Z"
    }
];

let nextJobId = 2;
let nextSavedOutfitId = 2;

export const createGenerationJob = async ({ bodyProfileId, closetItemIds, styleTagIds }) => {
    if (!bodyProfileId || !Array.isArray(closetItemIds) || closetItemIds.length === 0) {
        const error = new Error("코디 생성에 필요한 정보가 누락되었습니다.");
        error.status = 400;
        error.code = "REQUEST400";
        throw error;
    }

    const now = new Date().toISOString();
    const job = {
        jobId: nextJobId++,
        userId: 1,
        status: "queued",
        bodyProfileId,
        closetItemIds,
        styleTagIds: Array.isArray(styleTagIds) ? styleTagIds : [],
        createdAt: now,
        completedAt: null,
        outfitResultId: null,
        generatedImageUrl: null
    };

    outfitJobs.push(job);

    return {
        jobId: job.jobId,
        status: job.status,
        createdAt: job.createdAt
    };
};

export const getGenerationJob = async (jobId) => {
    const job = outfitJobs.find((item) => item.jobId === Number(jobId));

    if (!job) {
        const error = new Error("존재하지 않는 코디 생성 작업입니다.");
        error.status = 404;
        error.code = "NOT_FOUND404";
        throw error;
    }

    return {
        jobId: job.jobId,
        status: job.status,
        outfitResultId: job.outfitResultId,
        generatedImageUrl: job.generatedImageUrl,
        createdAt: job.createdAt,
        completedAt: job.completedAt
    };
};

export const saveOutfit = async ({ outfitResultId, name }) => {
    if (!outfitResultId) {
        const error = new Error("저장할 코디 결과 ID는 필수입니다.");
        error.status = 400;
        error.code = "REQUEST400";
        throw error;
    }

    const sourceJob = outfitJobs.find((job) => job.outfitResultId === Number(outfitResultId));

    if (!sourceJob) {
        const error = new Error("저장할 코디 결과를 찾을 수 없습니다.");
        error.status = 404;
        error.code = "NOT_FOUND404";
        throw error;
    }

    const savedOutfit = {
        savedOutfitId: nextSavedOutfitId++,
        userId: 1,
        outfitResultId: Number(outfitResultId),
        name: name || "저장한 코디",
        thumbnailUrl: sourceJob.generatedImageUrl,
        savedAt: new Date().toISOString()
    };

    savedOutfits.push(savedOutfit);

    return {
        savedOutfitId: savedOutfit.savedOutfitId,
        outfitResultId: savedOutfit.outfitResultId,
        name: savedOutfit.name,
        savedAt: savedOutfit.savedAt
    };
};

export const getSavedOutfits = async ({ page = 1, size = 10 }) => {
    const currentPage = Number(page);
    const pageSize = Number(size);

    if (currentPage < 1 || pageSize < 1) {
        const error = new Error("올바른 페이지 값을 입력해 주세요.");
        error.status = 400;
        error.code = "REQUEST400";
        throw error;
    }

    const startIndex = (currentPage - 1) * pageSize;
    const pagedItems = savedOutfits.slice(startIndex, startIndex + pageSize);

    return {
        savedOutfits: pagedItems.map(({ savedOutfitId, name, thumbnailUrl, savedAt }) => ({
            savedOutfitId,
            name,
            thumbnailUrl,
            savedAt
        })),
        page: currentPage,
        size: pageSize,
        totalCount: savedOutfits.length
    };
};

export const deleteSavedOutfit = async (savedOutfitId) => {
    const targetIndex = savedOutfits.findIndex((item) => item.savedOutfitId === Number(savedOutfitId));

    if (targetIndex === -1) {
        const error = new Error("저장된 코디를 찾을 수 없습니다.");
        error.status = 404;
        error.code = "NOT_FOUND404";
        throw error;
    }

    savedOutfits.splice(targetIndex, 1);
    return null;
};
