import { createHash, randomUUID } from 'node:crypto';

const DEMO_IMPORT_TYPE = 'DEMO_SEED';

const activeImageWhere = {
    status: 'ACTIVE',
    deletedAt: null,
    imageType: 'CLOSET_ITEM'
};

export class DemoClosetService {
    constructor({ getPrisma, storage, sourceUserId = Number(process.env.DEMO_CLOSET_SOURCE_USER_ID) }) {
        this.getPrisma = getPrisma;
        this.storage = storage;
        this.sourceUserId = sourceUserId;
    }

    isEnabled() {
        return Number.isSafeInteger(this.sourceUserId) && this.sourceUserId > 0;
    }

    async seedForUser(userId) {
        if (!this.isEnabled() || userId === this.sourceUserId) return { seeded: false, count: 0 };

        const prisma = this.getPrisma();
        const existing = await prisma.closetItem.count({
            where: { userId, importType: DEMO_IMPORT_TYPE, deletedAt: null }
        });
        if (existing > 0) return { seeded: false, count: existing };

        const sourceItems = await prisma.closetItem.findMany({
            where: { userId: this.sourceUserId, deletedAt: null },
            include: {
                tags: true,
                imageAsset: { where: activeImageWhere }
            },
            orderBy: { id: 'asc' }
        });
        if (sourceItems.length === 0) {
            throw new Error(`Demo closet source user ${this.sourceUserId} has no active closet items.`);
        }

        let createdCount = 0;
        for (const sourceItem of sourceItems) {
            let imageId = null;
            let targetStorageKey = null;
            try {
                if (sourceItem.imageAsset) {
                    const imageBuffer = await this.storage.getBuffer(sourceItem.imageAsset.storageKey);
                    targetStorageKey = `${userId}/demo-${randomUUID()}`;
                    await this.storage.put({
                        key: targetStorageKey,
                        buffer: imageBuffer,
                        mimeType: sourceItem.imageAsset.mimeType
                    });

                    const image = await prisma.imageAsset.create({
                        data: {
                            userId,
                            imageType: 'CLOSET_ITEM',
                            origin: 'USER_UPLOAD',
                            storageProvider: sourceItem.imageAsset.storageProvider,
                            storageKey: targetStorageKey,
                            originalFileName: sourceItem.imageAsset.originalFileName,
                            mimeType: sourceItem.imageAsset.mimeType,
                            fileSizeBytes: imageBuffer.length,
                            checksumSha256: createHash('sha256').update(imageBuffer).digest('hex'),
                            status: 'ACTIVE'
                        }
                    });
                    imageId = image.id;
                }

                await prisma.closetItem.create({
                    data: {
                        userId,
                        imageId,
                        name: sourceItem.name,
                        brand: sourceItem.brand,
                        colorText: sourceItem.colorText,
                        colorHex: sourceItem.colorHex,
                        subCategory: sourceItem.subCategory,
                        memo: sourceItem.memo,
                        category: sourceItem.category,
                        importType: DEMO_IMPORT_TYPE,
                        tags: { create: sourceItem.tags.map(({ tagName }) => ({ tagName })) }
                    }
                });
                createdCount += 1;
            } catch (error) {
                if (targetStorageKey) await this.storage.delete(targetStorageKey).catch(() => {});
                throw error;
            }
        }

        return { seeded: true, count: createdCount };
    }

    async removeDemoClosetForUser(userId) {
        if (!this.isEnabled() || userId === this.sourceUserId) return { removed: false, count: 0 };

        const prisma = this.getPrisma();
        const demoItems = await prisma.closetItem.findMany({
            where: { userId, importType: DEMO_IMPORT_TYPE, deletedAt: null },
            select: { id: true, imageId: true }
        });
        if (demoItems.length === 0) return { removed: false, count: 0 };

        const imageIds = [...new Set(demoItems.map((item) => item.imageId).filter(Boolean))];
        const images = imageIds.length > 0
            ? await prisma.imageAsset.findMany({ where: { id: { in: imageIds }, userId }, select: { id: true, storageKey: true } })
            : [];

        await prisma.$transaction([
            prisma.closetItem.deleteMany({ where: { id: { in: demoItems.map((item) => item.id) }, userId } }),
            ...(images.length > 0 ? [prisma.imageAsset.deleteMany({ where: { id: { in: images.map((image) => image.id) }, userId } })] : [])
        ]);

        await Promise.all(images.map((image) => this.storage.delete(image.storageKey).catch(() => {})));
        return { removed: true, count: demoItems.length };
    }

    async seedAllUsers({ replace = false } = {}) {
        if (!this.isEnabled()) {
            throw new Error('DEMO_CLOSET_SOURCE_USER_ID must be configured.');
        }
        const users = await this.getPrisma().user.findMany({
            where: { id: { not: this.sourceUserId } },
            select: { id: true }
        });
        const results = [];
        for (const user of users) {
            const removed = replace ? await this.removeDemoClosetForUser(user.id) : { removed: false, count: 0 };
            results.push({ userId: user.id, removedCount: removed.count, ...await this.seedForUser(user.id) });
        }
        return results;
    }
}
