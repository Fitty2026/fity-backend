import { sendResponse } from '../middlewares/response.middleware.js';
import {
    hasValidImageSignature,
    isSupportedImageType
} from '../services/image.service.js';

const createImageError = (status, code, message) => {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    return error;
};

const parseImageId = (value) => {
    const imageId = Number(value);
    if (!Number.isSafeInteger(imageId) || imageId <= 0) {
        throw createImageError(400, 'IMAGE4004', '유효한 이미지 ID가 필요합니다.');
    }
    return imageId;
};

export const createImageController = (imageService) => ({
    uploadImage: async (req, res, next) => {
        try {
            if (!req.file) {
                throw createImageError(400, 'IMAGE4001', '업로드할 이미지가 필요합니다.');
            }

            const rawImageType = req.body.imageType;
            const imageType = typeof rawImageType === 'string'
                ? rawImageType.trim().toUpperCase()
                : null;

            if (!imageType || !isSupportedImageType(imageType)) {
                throw createImageError(
                    400,
                    'IMAGE4002',
                    'imageType은 PROFILE, BODY_PROFILE, CLOSET_ITEM 중 하나여야 합니다.'
                );
            }

            if (!await hasValidImageSignature(req.file)) {
                throw createImageError(415, 'IMAGE4151', '지원하지 않는 이미지 형식입니다.');
            }

            const image = await imageService.uploadImage({
                ownerUserId: req.auth.userId,
                file: req.file,
                imageType
            });

            return sendResponse(res, image, '이미지를 저장했습니다.');
        } catch (error) {
            return next(error);
        }
    },

    getImage: async (req, res, next) => {
        try {
            const image = await imageService.getImage({
                imageId: parseImageId(req.params.imageId),
                ownerUserId: req.auth.userId
            });
            return sendResponse(res, image, '이미지를 조회했습니다.');
        } catch (error) {
            return next(error);
        }
    },

    getImageContent: async (req, res, next) => {
        try {
            const { asset, buffer } = await imageService.getImageContent({
                imageId: parseImageId(req.params.imageId),
                ownerUserId: req.auth.userId
            });
            res.set('Content-Type', asset.mimeType);
            res.set('Content-Length', String(buffer.length));
            res.set('Cache-Control', 'private, no-store');
            res.set('X-Content-Type-Options', 'nosniff');
            return res.status(200).send(buffer);
        } catch (error) {
            return next(error);
        }
    },

    getSignedImageContent: async (req, res, next) => {
        try {
            const { asset, buffer } = await imageService.getSignedImageContent({
                imageId: parseImageId(req.params.imageId),
                expires: req.query.expires,
                signature: req.query.signature
            });
            res.set('Content-Type', asset.mimeType);
            res.set('Content-Length', String(buffer.length));
            res.set('Cache-Control', 'private, max-age=300');
            res.set('X-Content-Type-Options', 'nosniff');
            return res.status(200).send(buffer);
        } catch (error) {
            return next(error);
        }
    },

    deleteImage: async (req, res, next) => {
        try {
            const result = await imageService.deleteImage({
                imageId: parseImageId(req.params.imageId),
                ownerUserId: req.auth.userId
            });
            return sendResponse(res, result, '이미지를 삭제했습니다.');
        } catch (error) {
            return next(error);
        }
    }
});
