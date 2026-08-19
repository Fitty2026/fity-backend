export class OutfitRepository {
    constructor(prismaOrProvider) {
        this.prismaProvider = typeof prismaOrProvider === 'function' ? prismaOrProvider : () => prismaOrProvider;
    }

    get prisma() {
        const prisma = this.prismaProvider();
        if (!prisma?.outfitGenerationJob) throw new TypeError('A Prisma client with outfit models is required.');
        return prisma;
    }

    async createOrFindActiveJob(data, now = new Date(), puzzleCharge = null) {
        return this.prisma.$transaction(async (tx) => {
            const active = await tx.outfitGenerationJob.findFirst({
                where: { userId: data.userId, status: { in: ['QUEUED', 'PROCESSING', 'QC_PENDING'] }, expiresAt: { gt: now } },
                orderBy: { createdAt: 'desc' }, include: { result: true }
            });
            if (active) return { job: active, isExistingJob: true };
            await tx.outfitGenerationJob.updateMany({
                where: { userId: data.userId, status: { in: ['QUEUED', 'PROCESSING', 'QC_PENDING'] }, expiresAt: { lte: now } },
                data: { status: 'EXPIRED', failureCode: 'JOB_TIMEOUT', failureReason: 'Outfit generation job expired.', completedAt: now }
            });
            const job = await tx.outfitGenerationJob.create({ data });
            if (puzzleCharge) {
                await tx.puzzleWallet.upsert({
                    where: { userId: data.userId },
                    create: { userId: data.userId, balance: 0 },
                    update: {}
                });
                const debited = await tx.puzzleWallet.updateMany({
                    where: { userId: data.userId, balance: { gte: puzzleCharge.amount } },
                    data: { balance: { decrement: puzzleCharge.amount } }
                });
                if (debited.count !== 1) {
                    throw Object.assign(new Error('Puzzle balance is insufficient.'), {
                        status: 409,
                        code: 'PUZZLE409_01'
                    });
                }
                const wallet = await tx.puzzleWallet.findUniqueOrThrow({ where: { userId: data.userId } });
                await tx.puzzleTransaction.create({
                    data: {
                        userId: data.userId,
                        type: 'DEBIT',
                        amount: puzzleCharge.amount,
                        balanceAfter: wallet.balance,
                        reason: 'OUTFIT_GENERATION',
                        idempotencyKey: `outfit-generation:${job.id}`,
                        referenceType: 'OUTFIT_GENERATION_JOB',
                        referenceId: String(job.id)
                    }
                });
            }
            return { job, isExistingJob: false };
        }, { isolationLevel: 'Serializable' });
    }

    async createRevisionJob({ revision, job }, now = new Date()) {
        return this.prisma.$transaction(async (tx) => {
            const active = await tx.outfitGenerationJob.findFirst({
                where: {
                    userId: job.userId,
                    status: { in: ['QUEUED', 'PROCESSING', 'QC_PENDING'] },
                    expiresAt: { gt: now }
                },
                select: { id: true }
            });
            if (active) throw Object.assign(new Error('An outfit generation job is already in progress.'), { code: 'ACTIVE_JOB_EXISTS' });
            const createdJob = await tx.outfitGenerationJob.create({ data: job });
            const createdRevision = await tx.outfitRevision.create({
                data: { ...revision, generationJobId: createdJob.id }
            });
            return { job: createdJob, revision: createdRevision };
        }, { isolationLevel: 'Serializable' });
    }

    async findOwnedClosetItems(userId, closetItemIds) {
        return this.prisma.closetItem.findMany({
            where: { userId, id: { in: closetItemIds }, deletedAt: null },
            select: { id: true, category: true }
        });
    }

    async findOwnedClosetItemIds(userId, closetItemIds) {
        return (await this.findOwnedClosetItems(userId, closetItemIds)).map((item) => item.id);
    }

    async findOwnedStyleTagIds(userId, styleTagIds) {
        const preferences = await this.prisma.userStylePreference.findMany({
            where: { userId, ...(styleTagIds ? { styleTagId: { in: styleTagIds } } : {}) },
            select: { styleTagId: true }
        });
        return preferences.map((preference) => preference.styleTagId);
    }

    async findGenerationContext(userId, selectedItemIds, styleTagIds) {
        const [bodyProfile, closetItemPool, stylePreferences] = await Promise.all([
            this.prisma.bodyProfile.findFirst({
                where: { userId },
                select: { id: true, bodyBalance: true, shoulderWidth: true, frameSize: true }
            }),
            this.prisma.closetItem.findMany({
                where: {
                    userId,
                    deletedAt: null,
                    imageAsset: { is: { status: 'ACTIVE', deletedAt: null } }
                },
                orderBy: { createdAt: 'desc' },
                include: {
                    tags: { select: { tagName: true } },
                    imageAsset: { select: { id: true, mimeType: true } }
                }
            }),
            this.prisma.userStylePreference.findMany({
                where: { userId, styleTagId: { in: styleTagIds } },
                orderBy: { styleTag: { displayOrder: 'asc' } },
                include: { styleTag: { select: { id: true, code: true, name: true } } }
            })
        ]);
        const selectedIdSet = new Set(selectedItemIds);
        return {
            bodyProfile,
            selectedItems: closetItemPool.filter((item) => selectedIdSet.has(item.id)),
            closetItemPool,
            stylePreferences: stylePreferences.map((preference) => preference.styleTag)
        };
    }

    findJobByIdempotencyKey(userId, idempotencyKey) {
        return this.prisma.outfitGenerationJob.findFirst({
            where: { userId, idempotencyKey },
            include: {
                revision: true,
                result: { include: { savedOutfits: { select: { id: true } } } }
            }
        });
    }

    findActiveBodyProfile(userId) {
        return this.prisma.bodyProfile.findFirst({ where: { userId }, select: { id: true } });
    }

    findJob(userId, id) {
        return this.prisma.outfitGenerationJob.findFirst({
            where: { id, userId },
            include: { revision: true, result: { include: { savedOutfits: { select: { id: true } } } } }
        });
    }

    findActiveJob(userId, now = new Date()) {
        return this.prisma.outfitGenerationJob.findFirst({
            where: { userId, status: { in: ['QUEUED', 'PROCESSING', 'QC_PENDING'] }, expiresAt: { gt: now } },
            orderBy: { createdAt: 'desc' }, include: { result: true }
        });
    }

    findLatestResumableJob(userId, completedAfter) {
        return this.prisma.outfitGenerationJob.findFirst({
            where: {
                userId,
                status: 'COMPLETED',
                completedAt: { gt: completedAfter },
                result: { savedOutfits: { none: {} } }
            },
            orderBy: { completedAt: 'desc' },
            include: { result: { include: { savedOutfits: { select: { id: true } } } } }
        });
    }

    async listQueuedJobIds(limit = 5, now = new Date()) {
        const jobs = await this.prisma.outfitGenerationJob.findMany({
            where: { status: 'QUEUED', expiresAt: { gt: now } },
            orderBy: { createdAt: 'asc' },
            take: limit,
            select: { id: true }
        });
        return jobs.map((job) => job.id);
    }

    expireStaleActiveJobs(userId, now = new Date()) {
        return this.prisma.outfitGenerationJob.updateMany({
            where: { userId, status: { in: ['QUEUED', 'PROCESSING', 'QC_PENDING'] }, expiresAt: { lte: now } },
            data: { status: 'EXPIRED', failureCode: 'JOB_TIMEOUT', failureReason: 'Outfit generation job expired.', completedAt: now }
        });
    }

    expireCompletedJob(id) {
        return this.prisma.outfitGenerationJob.updateMany({
            where: {
                id,
                status: 'COMPLETED',
                result: { savedOutfits: { none: {} } }
            },
            data: { status: 'EXPIRED', failureCode: 'RESULT_EXPIRED', failureReason: 'Unsaved outfit result expired.' }
        });
    }

    expireAllStaleActiveJobs(now = new Date()) {
        return this.prisma.outfitGenerationJob.updateMany({
            where: { status: { in: ['QUEUED', 'PROCESSING', 'QC_PENDING'] }, expiresAt: { lte: now } },
            data: { status: 'EXPIRED', failureCode: 'JOB_TIMEOUT', failureReason: 'Outfit generation job expired.', completedAt: now }
        });
    }

    expireAllCompletedJobs(cutoff) {
        return this.prisma.outfitGenerationJob.updateMany({
            where: {
                status: 'COMPLETED',
                completedAt: { lte: cutoff },
                result: { savedOutfits: { none: {} } }
            },
            data: { status: 'EXPIRED', failureCode: 'RESULT_EXPIRED', failureReason: 'Unsaved outfit result expired.' }
        });
    }

    async claimQueuedJob(id, now = new Date()) {
        const updated = await this.prisma.outfitGenerationJob.updateMany({
            where: { id, status: 'QUEUED', expiresAt: { gt: now } }, data: { status: 'PROCESSING', progress: 70, startedAt: now }
        });
        return updated.count === 1 ? this.prisma.outfitGenerationJob.findUnique({ where: { id } }) : null;
    }

    markQcPending(id) {
        return this.prisma.outfitGenerationJob.updateMany({
            where: { id, status: 'PROCESSING' }, data: { status: 'QC_PENDING', progress: 90 }
        });
    }

    completeJob({ job, aiResult, completedAt = new Date() }) {
        return this.prisma.$transaction(async (tx) => {
            const result = await tx.outfitResult.create({ data: {
                userId: job.userId, generationJobId: job.id, generatedImageUrl: aiResult.generatedImageUrl,
                provider: aiResult.provider, modelVersion: aiResult.modelVersion,
                promptVersion: aiResult.promptVersion, fallbackUsed: aiResult.fallbackUsed,
                ...(aiResult.outfitItems ? { outfitItems: aiResult.outfitItems } : {}),
                recommendedClosetItemIds: aiResult.recommendedClosetItemIds
            } });
            const updated = await tx.outfitGenerationJob.updateMany({
                where: { id: job.id, status: 'QC_PENDING' },
                data: { status: 'COMPLETED', progress: 100, completedAt, failureCode: null, failureReason: null }
            });
            if (updated.count !== 1) throw new Error('Outfit job completion transition failed.');
            return result;
        });
    }

    failJob({ id, code, reason, completedAt = new Date() }) {
        return this.prisma.outfitGenerationJob.updateMany({
            where: { id, status: { in: ['PROCESSING', 'QC_PENDING'] } },
            data: { status: 'FAILED', failureCode: code, failureReason: reason.slice(0, 500), completedAt }
        });
    }

    findResult(userId, id) {
        return this.prisma.outfitResult.findFirst({ where: { id, userId }, include: { generationJob: true } });
    }

    saveResult({ userId, outfitResultId, name, tags, memo }) {
        return this.prisma.savedOutfit.create({
            data: { userId, outfitResultId, name, tags, memo },
            include: { outfitResult: { include: { generationJob: true } } }
        });
    }

    listSaved(userId, skip, take, deleted = false) {
        const where = { userId, deletedAt: deleted ? { not: null } : null };
        return this.prisma.$transaction([
            this.prisma.savedOutfit.findMany({ where, orderBy: deleted ? { deletedAt: 'desc' } : { createdAt: 'desc' }, skip, take, include: { outfitResult: { include: { generationJob: true } } } }),
            this.prisma.savedOutfit.count({ where })
        ]);
    }

    findSaved(userId, id) {
        return this.prisma.savedOutfit.findFirst({
            where: { id, userId, deletedAt: null },
            include: { outfitResult: { include: { generationJob: true } } }
        });
    }

    updateSaved(userId, id, data) {
        return this.prisma.$transaction(async (tx) => {
            const existing = await tx.savedOutfit.findFirst({ where: { id, userId, deletedAt: null }, select: { id: true } });
            if (!existing) return null;
            return tx.savedOutfit.update({
                where: { id }, data,
                include: { outfitResult: { include: { generationJob: true } } }
            });
        });
    }

    softDeleteSaved(userId, id, deletedAt = new Date()) {
        return this.prisma.savedOutfit.updateMany({ where: { id, userId, deletedAt: null }, data: { deletedAt } });
    }

    restoreSaved(userId, id, deletedAfter) {
        return this.prisma.savedOutfit.updateMany({
            where: { id, userId, deletedAt: { not: null, gt: deletedAfter } },
            data: { deletedAt: null }
        });
    }

    purgeDeletedSavedOutfits(deletedBefore) {
        return this.prisma.savedOutfit.deleteMany({
            where: { deletedAt: { not: null, lte: deletedBefore } }
        });
    }

    permanentDeleteSaved(userId, id) {
        return this.prisma.savedOutfit.deleteMany({ where: { id, userId, deletedAt: { not: null } } });
    }
}
