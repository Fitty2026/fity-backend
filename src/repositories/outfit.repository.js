export class OutfitRepository {
    constructor(prismaOrProvider) {
        this.prismaProvider = typeof prismaOrProvider === 'function' ? prismaOrProvider : () => prismaOrProvider;
    }

    get prisma() {
        const prisma = this.prismaProvider();
        if (!prisma?.outfitGenerationJob) throw new TypeError('A Prisma client with outfit models is required.');
        return prisma;
    }

    createJob({ userId, bodyProfileId = null, closetItemIds, styleTagIds }) {
        return this.prisma.outfitGenerationJob.create({ data: { userId, bodyProfileId, closetItemIds, styleTagIds } });
    }

    findJob(userId, id) {
        return this.prisma.outfitGenerationJob.findFirst({ where: { id, userId }, include: { result: true } });
    }

    async claimQueuedJob(id, now = new Date()) {
        const updated = await this.prisma.outfitGenerationJob.updateMany({
            where: { id, status: 'QUEUED' }, data: { status: 'PROCESSING', startedAt: now }
        });
        return updated.count === 1 ? this.prisma.outfitGenerationJob.findUnique({ where: { id } }) : null;
    }

    completeJob({ job, aiResult, completedAt = new Date() }) {
        return this.prisma.$transaction(async (tx) => {
            const result = await tx.outfitResult.create({ data: {
                userId: job.userId, generationJobId: job.id, generatedImageUrl: aiResult.generatedImageUrl,
                provider: aiResult.provider, fallbackUsed: aiResult.fallbackUsed,
                recommendedClosetItemIds: aiResult.recommendedClosetItemIds
            } });
            const updated = await tx.outfitGenerationJob.updateMany({
                where: { id: job.id, status: 'PROCESSING' },
                data: { status: 'COMPLETED', completedAt, failureCode: null, failureReason: null }
            });
            if (updated.count !== 1) throw new Error('Outfit job completion transition failed.');
            return result;
        });
    }

    failJob({ id, code, reason, completedAt = new Date() }) {
        return this.prisma.outfitGenerationJob.updateMany({
            where: { id, status: 'PROCESSING' },
            data: { status: 'FAILED', failureCode: code, failureReason: reason.slice(0, 500), completedAt }
        });
    }

    findResult(userId, id) { return this.prisma.outfitResult.findFirst({ where: { id, userId } }); }

    saveResult({ userId, outfitResultId, name }) {
        return this.prisma.savedOutfit.create({ data: { userId, outfitResultId, name } });
    }

    listSaved(userId, skip, take) {
        return this.prisma.$transaction([
            this.prisma.savedOutfit.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, skip, take, include: { outfitResult: true } }),
            this.prisma.savedOutfit.count({ where: { userId } })
        ]);
    }

    deleteSaved(userId, id) { return this.prisma.savedOutfit.deleteMany({ where: { id, userId } }); }
}
