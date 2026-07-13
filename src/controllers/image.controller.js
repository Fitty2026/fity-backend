import { sendResponse } from '../middlewares/response.middleware.js';
import {
    hasValidImageSignature,
    isSupportedImageType,
    registerTemporaryImage
} from '../services/image.service.js';

const createImageError = (status, code, message) => {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    return error;
};

export const uploadImage = (req, res, next) => {
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

        if (!hasValidImageSignature(req.file)) {
            throw createImageError(415, 'IMAGE4151', '지원하지 않는 이미지 형식입니다.');
        }

        const image = registerTemporaryImage({
            file: req.file,
            imageType
        });

        return sendResponse(res, image, '이미지 업로드 요청을 정상적으로 수신했습니다.');
    } catch (error) {
        return next(error);
    }
};
