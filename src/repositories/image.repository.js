const ACTIVE_STATUS = 'ACTIVE';

export class ImageRepository {
    constructor(prismaOrProvider) {
        if (typeof prismaOrProvider !== 'function' && !prismaOrProvider?.imageAsset) {
            throw new TypeError('A Prisma client or provider is required.');
        }
        this.prismaProvider = typeof prismaOrProvider === 'function'
            ? prismaOrProvider
            : () => prismaOrProvider;
    }

    get imageAsset() {
        const imageAsset = this.prismaProvider()?.imageAsset;
        if (!imageAsset) {
            throw new TypeError('A Prisma client with imageAsset is required.');
        }
        return imageAsset;
    }

    async createUploading({ ownerUserId, ...data }) {
        return this.imageAsset.create({
            data: {
                ...data,
                userId: ownerUserId,
                status: 'UPLOADING'
            }
        });
    }

    async findOwnedActive({ imageId, ownerUserId }) {
        return this.imageAsset.findFirst({
            where: {
                id: imageId,
                userId: ownerUserId,
                status: ACTIVE_STATUS,
                deletedAt: null
            }
        });
    }

    async findActive({ imageId }) {
        return this.imageAsset.findFirst({
            where: {
                id: imageId,
                status: ACTIVE_STATUS,
                deletedAt: null
            }
        });
    }

    async findOwned({ imageId, ownerUserId }) {
        return this.imageAsset.findFirst({
            where: {
                id: imageId,
                userId: ownerUserId
            }
        });
    }

    async findStaleInProgress({ before, limit = 100 }) {
        return this.imageAsset.findMany({
            where: {
                status: { in: ['UPLOADING', 'DELETE_PENDING'] },
                updatedAt: { lt: before }
            },
            orderBy: { updatedAt: 'asc' },
            take: limit
        });
    }

    async transitionStatus({ imageId, ownerUserId, from, to, data = {} }) {
        const result = await this.imageAsset.updateMany({
            where: {
                id: imageId,
                userId: ownerUserId,
                status: Array.isArray(from) ? { in: from } : from
            },
            data: {
                ...data,
                status: to
            }
        });

        return result.count === 1;
    }

    async markActive({ imageId, ownerUserId }) {
        return this.transitionStatus({
            imageId,
            ownerUserId,
            from: 'UPLOADING',
            to: ACTIVE_STATUS
        });
    }

    async markUploadFailed({ imageId, ownerUserId }) {
        return this.transitionStatus({
            imageId,
            ownerUserId,
            from: 'UPLOADING',
            to: 'UPLOAD_FAILED'
        });
    }

    async markDeletePending({ imageId, ownerUserId }) {
        return this.transitionStatus({
            imageId,
            ownerUserId,
            from: [ACTIVE_STATUS, 'DELETE_FAILED'],
            to: 'DELETE_PENDING'
        });
    }

    async markDeleted({ imageId, ownerUserId, deletedAt = new Date() }) {
        return this.transitionStatus({
            imageId,
            ownerUserId,
            from: 'DELETE_PENDING',
            to: 'DELETED',
            data: { deletedAt }
        });
    }

    async markDeleteFailed({ imageId, ownerUserId }) {
        return this.transitionStatus({
            imageId,
            ownerUserId,
            from: 'DELETE_PENDING',
            to: 'DELETE_FAILED'
        });
    }
}
