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

const uploadBodyProfileStorage = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_IMAGE_SIZE, // 10MB
        files: 3,                 // 3장 허용
        fields: 5,
        parts: 10
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

export const uploadBodyProfileImages = (req, res, next) => {
    if (!req.is('multipart/form-data')) {
        const error = new Error('이미지 업로드 요청 형식이 올바르지 않습니다.');
        error.status = 400;
        error.code = 'IMAGE4003';
        return next(error);
    }

    const multiUpload = uploadBodyProfileStorage.fields([
        { name: 'frontImage', maxCount: 1 },
        { name: 'sideImage', maxCount: 1 },
        { name: 'backImage', maxCount: 1 }
    ]);

    multiUpload(req, res, (error) => {
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


const uploadReceiptStorage = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_IMAGE_SIZE, // 10MB
        files: 5,               
    },
    fileFilter: (req, file, callback) => {
        if (ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
            return callback(null, true);
        }
        const error = new Error('지원하지 않는 이미지 파일 형식입니다.');
        error.status = 400;
        error.code = 'OCR400_02'; 
        return callback(error);
    }
});

export const uploadReceiptImages = (req, res, next) => {
    if (!req.is('multipart/form-data')) {
        const error = new Error('이미지 업로드 요청 형식이 올바르지 않습니다.');
        error.status = 400;
        error.code = 'IMAGE4003';
        return next(error);
    }

    const arrayUpload = uploadReceiptStorage.array('receiptImages', 5);

    arrayUpload(req, res, (error) => {
        if (!error) {
            return next();
        }

        if (error instanceof multer.MulterError) {
            if (error.code === 'LIMIT_UNEXPECTED_FILE') {
                error.status = 400;
                error.code = 'OCR400_03'; 
                error.message = '영수증 이미지는 최대 5장까지만 업로드 가능합니다.';
            } else if (error.code === 'LIMIT_FILE_SIZE') {
                error.status = 413;
                error.code = 'IMAGE4131'; 
                error.message = '이미지 크기는 10MB 이하여야 합니다.';
            } else {
                error.status = 400;
                error.code = 'IMAGE4003';
                error.message = '이미지 업로드 요청 형식이 올바르지 않습니다.';
            }
        } else if (error.code !== 'OCR400_02') {
            error.status = 400;
            error.code = 'IMAGE4003';
            error.message = '이미지 업로드 요청 형식이 올바르지 않습니다.';
        }

        return next(error);
    });
};