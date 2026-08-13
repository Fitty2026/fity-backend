import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';

const CLIENT_IMAGE_TYPES = new Set([
    'PROFILE',
    'BODY_PROFILE',
    'CLOSET_ITEM'
]);

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx']);
const HEIF_BRANDS = new Set(['heif', 'mif1', 'msf1']);

const normalizeOriginalFileName = (value) => {
    if (typeof value !== 'string' || value.trim() === '') {
        return null;
    }
    const baseName = path.basename(value.replaceAll('\\', '/'));
    const printable = baseName.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '');
    return [...printable].slice(0, 255).join('') || null;
};

const createImageError = (status, code, message, cause) => {
    const error = new Error(message, cause ? { cause } : undefined);
    error.status = status;
    error.code = code;
    return error;
};

const detectImageMimeType = (buffer) => {
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    )) {
        return 'image/png';
    }

    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return 'image/jpeg';
    }

    if (
        buffer.length >= 12
        && buffer.toString('ascii', 0, 4) === 'RIFF'
        && buffer.toString('ascii', 8, 12) === 'WEBP'
    ) {
        return 'image/webp';
    }

    if (buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp') {
        const brand = buffer.toString('ascii', 8, 12);

        if (HEIC_BRANDS.has(brand)) {
            return 'image/heic';
        }

        if (HEIF_BRANDS.has(brand)) {
            return 'image/heif';
        }
    }

    return null;
};

const toImageResponse = (asset) => ({
    imageId: asset.id,
    imageType: asset.imageType,
    origin: asset.origin,
    originalName: asset.originalFileName,
    mimeType: asset.mimeType,
    sizeBytes: asset.fileSizeBytes,
    checksumSha256: asset.checksumSha256,
    imageUrl: `/api/v1/images/${asset.id}/content`,
    uploadStatus: asset.status,
    createdAt: asset.createdAt
});

export const isSupportedImageType = (imageType) => CLIENT_IMAGE_TYPES.has(imageType);

export const hasValidImageSignature = async (file) => {
    const detectedMimeType = detectImageMimeType(file.buffer);

    if (file.mimetype === 'image/heic' || file.mimetype === 'image/heif') {
        if (detectedMimeType !== 'image/heic' && detectedMimeType !== 'image/heif') {
            return false;
        }
    } else if (detectedMimeType !== file.mimetype) {
        return false;
    }

    try {
        const metadata = await sharp(file.buffer, { failOn: 'error' }).metadata();
        return Number.isInteger(metadata.width)
            && metadata.width > 0
            && Number.isInteger(metadata.height)
            && metadata.height > 0;
    } catch {
        return false;
    }
};

export class ImageService {
    constructor({ repository, storage, urlSigner, storageProvider = 'local' }) {
        this.repository = repository;
        this.storage = storage;
        this.storageProvider = storageProvider;
        this.urlSigner = urlSigner;
    }

    async persistImage({ ownerUserId, file, imageType, origin }) {
        const storageKey = `${ownerUserId}/${randomUUID()}`;
        const checksumSha256 = createHash('sha256').update(file.buffer).digest('hex');
        let asset;

        try {
            asset = await this.repository.createUploading({
                ownerUserId,
                imageType,
                origin,
                storageProvider: this.storageProvider,
                storageKey,
                originalFileName: normalizeOriginalFileName(file.originalname),
                mimeType: file.mimetype,
                fileSizeBytes: file.size ?? file.buffer.length,
                checksumSha256
            });
        } catch (cause) {
            throw createImageError(503, 'IMAGE5031', '이미지 메타데이터를 저장하지 못했습니다.', cause);
        }

        try {
            await this.storage.put({
                key: storageKey,
                buffer: file.buffer,
                mimeType: file.mimetype
            });
            const activated = await this.repository.markActive({
                imageId: asset.id,
                ownerUserId
            });
            if (!activated) {
                throw new Error('Image asset state transition failed.');
            }
        } catch (cause) {
            await this.storage.delete(storageKey).catch(() => {});
            await this.repository.markUploadFailed({
                imageId: asset.id,
                ownerUserId
            }).catch(() => {});
            throw createImageError(503, 'IMAGE5032', '이미지 파일을 저장하지 못했습니다.', cause);
        }

        const activeAsset = await this.repository.findOwnedActive({
            imageId: asset.id,
            ownerUserId
        });
        if (!activeAsset) {
            throw createImageError(503, 'IMAGE5032', '저장된 이미지 상태를 확인하지 못했습니다.');
        }
        return toImageResponse(activeAsset);
    }

    async uploadImage({ ownerUserId, file, imageType }) {
        return this.persistImage({
            ownerUserId,
            file,
            imageType,
            origin: 'USER_UPLOAD'
        });
    }

    async createGeneratedImage({ ownerUserId, file, fallback = false }) {
        if (!await hasValidImageSignature(file)) {
            throw createImageError(415, 'IMAGE4151', '지원하지 않는 이미지 형식입니다.');
        }

        return this.persistImage({
            ownerUserId,
            file,
            imageType: 'OUTFIT_RESULT',
            origin: fallback ? 'FALLBACK' : 'GENERATED'
        });
    }

    async getImage({ imageId, ownerUserId }) {
        let asset;
        try {
            asset = await this.repository.findOwnedActive({ imageId, ownerUserId });
        } catch (cause) {
            throw createImageError(503, 'IMAGE5035', '이미지 메타데이터를 조회하지 못했습니다.', cause);
        }
        if (!asset) {
            throw createImageError(404, 'IMAGE4041', '이미지를 찾을 수 없습니다.');
        }
        return toImageResponse(asset);
    }

    async getImageContent({ imageId, ownerUserId }) {
        let asset;
        try {
            asset = await this.repository.findOwnedActive({ imageId, ownerUserId });
        } catch (cause) {
            throw createImageError(503, 'IMAGE5035', '이미지 메타데이터를 조회하지 못했습니다.', cause);
        }
        if (!asset) {
            throw createImageError(404, 'IMAGE4041', '이미지를 찾을 수 없습니다.');
        }

        try {
            const buffer = await this.storage.getBuffer(asset.storageKey);
            return { asset, buffer };
        } catch (cause) {
            throw createImageError(503, 'IMAGE5033', '이미지 파일을 읽지 못했습니다.', cause);
        }
    }

    async getSignedImageContent({ imageId, expires, signature }) {
        if (!this.urlSigner?.verify({ imageId, expires, signature })) {
            throw createImageError(403, 'IMAGE4031', '이미지 URL이 만료되었거나 유효하지 않습니다.');
        }

        let asset;
        try {
            asset = await this.repository.findActive({ imageId });
        } catch (cause) {
            throw createImageError(503, 'IMAGE5035', '이미지 메타데이터를 조회하지 못했습니다.', cause);
        }
        if (!asset) {
            throw createImageError(404, 'IMAGE4041', '이미지를 찾을 수 없습니다.');
        }

        try {
            const buffer = await this.storage.getBuffer(asset.storageKey);
            return { asset, buffer };
        } catch (cause) {
            throw createImageError(503, 'IMAGE5033', '이미지 파일을 읽지 못했습니다.', cause);
        }
    }

    async deleteImage({ imageId, ownerUserId }) {
        let asset;
        try {
            asset = await this.repository.findOwned({ imageId, ownerUserId });
        } catch (cause) {
            throw createImageError(503, 'IMAGE5035', '이미지 메타데이터를 조회하지 못했습니다.', cause);
        }
        if (!asset || !['ACTIVE', 'DELETE_FAILED'].includes(asset.status)) {
            throw createImageError(404, 'IMAGE4041', '이미지를 찾을 수 없습니다.');
        }

        let pending;
        try {
            pending = await this.repository.markDeletePending({ imageId, ownerUserId });
        } catch (cause) {
            throw createImageError(503, 'IMAGE5035', '이미지 삭제 상태를 저장하지 못했습니다.', cause);
        }
        if (!pending) {
            throw createImageError(409, 'IMAGE4091', '이미지를 현재 삭제할 수 없습니다.');
        }

        try {
            await this.storage.delete(asset.storageKey);
            const deleted = await this.repository.markDeleted({ imageId, ownerUserId });
            if (!deleted) {
                throw new Error('Image delete state transition failed.');
            }
        } catch (cause) {
            await this.repository.markDeleteFailed({ imageId, ownerUserId }).catch(() => {});
            throw createImageError(503, 'IMAGE5034', '이미지 삭제를 완료하지 못했습니다.', cause);
        }

        return { imageId, status: 'DELETED' };
    }

    async reconcileStaleAssets({
        before = new Date(Date.now() - 15 * 60 * 1000),
        limit = 100
    } = {}) {
        const staleAssets = await this.repository.findStaleInProgress({ before, limit });
        const results = [];

        for (const asset of staleAssets) {
            if (asset.status === 'UPLOADING') {
                await this.storage.delete(asset.storageKey).catch(() => {});
                const updated = await this.repository.markUploadFailed({
                    imageId: asset.id,
                    ownerUserId: asset.userId
                });
                results.push({ imageId: asset.id, status: updated ? 'UPLOAD_FAILED' : 'UNCHANGED' });
                continue;
            }

            try {
                await this.storage.delete(asset.storageKey);
                const updated = await this.repository.markDeleted({
                    imageId: asset.id,
                    ownerUserId: asset.userId
                });
                results.push({ imageId: asset.id, status: updated ? 'DELETED' : 'UNCHANGED' });
            } catch {
                const updated = await this.repository.markDeleteFailed({
                    imageId: asset.id,
                    ownerUserId: asset.userId
                });
                results.push({ imageId: asset.id, status: updated ? 'DELETE_FAILED' : 'UNCHANGED' });
            }
        }

        return results;
    }
}
