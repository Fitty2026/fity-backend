import multer from 'multer';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
]);

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_IMAGE_SIZE,
        files: 1,
        fields: 1,
        parts: 3,
        fieldSize: 64
    },
    fileFilter: (req, file, callback) => {
        if (ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
            return callback(null, true);
        }

        const error = new Error('지원하지 않는 이미지 형식입니다.');
        error.status = 415;
        error.code = 'IMAGE4151';
        return callback(error);
    }
});

export const uploadSingleImage = (req, res, next) => {
    if (!req.is('multipart/form-data')) {
        const error = new Error('이미지 업로드 요청 형식이 올바르지 않습니다.');
        error.status = 400;
        error.code = 'IMAGE4003';
        return next(error);
    }

    upload.single('image')(req, res, (error) => {
        if (!error) {
            return next();
        }

        if (error instanceof multer.MulterError) {
            error.status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
            error.code = error.code === 'LIMIT_FILE_SIZE' ? 'IMAGE4131' : 'IMAGE4003';
            error.message = error.status === 413
                ? '이미지 크기는 10MB 이하여야 합니다.'
                : '이미지 업로드 요청 형식이 올바르지 않습니다.';
        } else if (error.code !== 'IMAGE4151') {
            error.status = 400;
            error.code = 'IMAGE4003';
            error.message = '이미지 업로드 요청 형식이 올바르지 않습니다.';
        }

        return next(error);
    });
};
