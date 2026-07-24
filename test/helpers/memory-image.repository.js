const clone = (record) => record ? { ...record } : null;

export class MemoryImageRepository {
    constructor(initialRecords = []) {
        this.records = new Map();
        this.nextId = 1;

        for (const record of initialRecords) {
            this.records.set(record.id, clone(record));
            this.nextId = Math.max(this.nextId, record.id + 1);
        }
    }

    async createUploading({ ownerUserId, ...data }) {
        const now = new Date();
        const record = {
            id: this.nextId++,
            ...data,
            userId: ownerUserId,
            status: 'UPLOADING',
            createdAt: data.createdAt ?? now,
            updatedAt: data.updatedAt ?? now,
            deletedAt: data.deletedAt ?? null
        };
        this.records.set(record.id, record);
        return clone(record);
    }

    async findOwnedActive({ imageId, ownerUserId }) {
        const record = this.records.get(imageId);
        if (
            !record
            || record.userId !== ownerUserId
            || record.status !== 'ACTIVE'
            || record.deletedAt !== null
        ) {
            return null;
        }
        return clone(record);
    }

    async findOwned({ imageId, ownerUserId }) {
        const record = this.records.get(imageId);
        return record?.userId === ownerUserId ? clone(record) : null;
    }

    async findStaleInProgress({ before, limit = 100 }) {
        return [...this.records.values()]
            .filter((record) => (
                ['UPLOADING', 'DELETE_PENDING'].includes(record.status)
                && record.updatedAt < before
            ))
            .sort((left, right) => left.updatedAt - right.updatedAt)
            .slice(0, limit)
            .map(clone);
    }

    async transitionStatus({ imageId, ownerUserId, from, to, data = {} }) {
        const record = this.records.get(imageId);
        const allowedStatuses = Array.isArray(from) ? from : [from];

        if (
            !record
            || record.userId !== ownerUserId
            || !allowedStatuses.includes(record.status)
        ) {
            return false;
        }

        Object.assign(record, data, {
            status: to,
            updatedAt: new Date()
        });
        return true;
    }

    async markActive({ imageId, ownerUserId }) {
        return this.transitionStatus({
            imageId,
            ownerUserId,
            from: 'UPLOADING',
            to: 'ACTIVE'
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
            from: ['ACTIVE', 'DELETE_FAILED'],
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
