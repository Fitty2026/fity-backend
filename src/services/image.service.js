const SUPPORTED_IMAGE_TYPES = new Set([
    'PROFILE',
    'BODY_PROFILE',
    'CLOSET_ITEM'
]);

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx']);
const HEIF_BRANDS = new Set(['heif', 'mif1', 'msf1']);

let temporaryImageId = Date.now();

export const isSupportedImageType = (imageType) => (
    SUPPORTED_IMAGE_TYPES.has(imageType)
);

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

export const hasValidImageSignature = (file) => {
    const detectedMimeType = detectImageMimeType(file.buffer);

    if (file.mimetype === 'image/heic' || file.mimetype === 'image/heif') {
        return detectedMimeType === 'image/heic' || detectedMimeType === 'image/heif';
    }

    return detectedMimeType === file.mimetype;
};

export const registerTemporaryImage = ({ file, imageType }) => {
    temporaryImageId += 1;

    // M2 스켈레톤에서는 multipart 수신과 API 계약만 검증합니다.
    // M3에서 저장소 업로드와 image_assets DB 저장으로 교체해야 합니다.
    return {
        imageId: temporaryImageId,
        imageType,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        imageUrl: null,
        uploadStatus: 'RECEIVED'
    };
};
