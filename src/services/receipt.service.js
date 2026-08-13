import axios from 'axios';
import { randomUUID } from 'node:crypto';

const COLOR_DICTIONARY = {
    "블랙": "#000000", "BLACK": "#000000", "BLK": "#000000", "검정": "#000000",
    "화이트": "#FFFFFF", "WHITE": "#FFFFFF", "WHT": "#FFFFFF", "흰색": "#FFFFFF",
    "그레이": "#808080", "GRAY": "#808080", "회색": "#808080",
    "네이비": "#000080", "NAVY": "#000080",
    "레드": "#FF0000", "RED": "#FF0000", "빨강": "#FF0000",
    "브라운": "#A52A2A", "BROWN": "#A52A2A", "갈색": "#A52A2A", "BRN": "#A52A2A",
    "핑크": "#FFC0CB", "PINK": "#FFC0CB", "분홍": "#FFC0CB", "PNK": "#FFC0CB"
};

const createReceiptError = (status, code, message, cause) => {
    const error = new Error(message, cause ? { cause } : undefined);
    error.status = status;
    error.code = code;
    return error;
};

const VALID_PLATFORMS = ['MUSINSA', 'ZIGZAG', 'ABLY', 'OFFLINE'];
const VALID_CATEGORIES = ['TOP', 'BOTTOM', 'OUTER', 'SHOES', 'ACCESSORY', 'ETC']; 

export class ReceiptService {
    constructor({ prisma, getPrisma } = {}) {
        if (!prisma && !getPrisma) {
            throw new TypeError('ReceiptService에는 prisma 또는 getPrisma가 필요합니다.');
        }
        this.getPrisma = getPrisma || (() => prisma);
    }

    // [API 1] OCR 처리
    async processOcr({ files, importType, platform }) {
        if (!files || files.length === 0) {
            throw createReceiptError(400, 'OCR400_01', '영수증 캡처 이미지는 필수 입력 항목입니다.');
        }

        if (platform && !VALID_PLATFORMS.includes(platform)) {
            throw createReceiptError(400, 'OCR400_04', '지원하지 않는 쇼핑몰 플랫폼입니다.');
        }

        let extractedData = [];

        const NAVER_RECEIPT_URL = process.env.NAVER_RECEIPT_OCR_URL; 
        const NAVER_SECRET_KEY = process.env.NAVER_OCR_SECRET_KEY;

        for (const file of files) {
            if (importType !== 'RECEIPT') {
                extractedData.push({
                    productName: "베이직 오버핏 반팔 티셔츠 (테스트)",
                    brand: "무신사 스탠다드",
                    category: "TOP", 
                    subCategory: "반팔 티셔츠",
                    colorText: "딥 인디고", 
                    colorHex: null,
                    purchaseDate: new Date().toISOString().split('T')[0],
                    purchasePlace: platform || "MUSINSA",
                    importType: importType,
                    imageId: null, 
                    tags: ["여름용", "캐주얼"],
                    memo: "온라인 구매내역 임시 테스트 데이터입니다."
                });
                continue; 
            }

            const base64Image = file.buffer.toString('base64');
            const fileExt = file.originalname?.split('.').pop().toLowerCase() || 'png';

            const requestBody = {
                version: 'V2',
                requestId: randomUUID(),
                timestamp: Date.now(),
                images: [{ format: fileExt, name: 'fitty_receipt_ocr', data: base64Image }]
            };

            try {
                const response = await axios.post(NAVER_RECEIPT_URL, requestBody, {
                    headers: {
                        'X-OCR-SECRET': NAVER_SECRET_KEY,
                        'Content-Type': 'application/json'
                    }
                });

                console.log("👉 네이버 Raw 응답 데이터:", JSON.stringify(response.data, null, 2));

                const fields = response.data.images[0].fields || [];
                
                const detectedTexts = fields.map(f => f.inferText).filter(Boolean);

                if (detectedTexts.length > 0) {
                    const parsedBrand = detectedTexts[0] || "Fitty 브랜드";
                    const parsedProductName = detectedTexts.slice(1, 4).join(' ') || detectedTexts[0] || "인식된 상품";
                    const allText = detectedTexts.join(' ').toUpperCase();

                    let parsedColorText = null;
                    let matchedHex = null;

                    for (const [key, hex] of Object.entries(COLOR_DICTIONARY)) {
                        if (allText.includes(key.toUpperCase())) {
                            parsedColorText = key;  // "블랙"
                            matchedHex = hex;       // "#000000"
                            break;
                        }
                    }

                    extractedData.push({
                        productName: parsedProductName,
                        brand: parsedBrand,            
                        category: "TOP",
                        subCategory: null,
                        colorText: parsedColorText, 
                        colorHex: matchedHex,
                        purchaseDate: new Date().toISOString().split('T')[0],
                        purchasePlace: platform || "OFFLINE",
                        importType,
                        imageId: null, 
                        tags: [],
                        memo: null
                    });
                }

            } catch (cause) {
                console.error("네이버 OCR API 호출 에러:", cause?.response?.data || cause.message);
                throw createReceiptError(500, 'OCR500_01', '영수증 글자를 인식할 수 없습니다. 더 선명한 사진으로 다시 시도해 주세요.', cause);
            }
        }

        return {
            platform: platform || "OFFLINE",
            extractedItems: extractedData 
        };
    }

    // [API 2] 연관 이미지 조회
    async findRelatedImages({ brand, productName, colorHex }) {
        if (!brand || !productName || !colorHex) {
            throw createReceiptError(400, 'OCR400_10', '필수 검색 조건(브랜드, 제품명, 색상)이 누락되었습니다.');
        }

        try {
            const prisma = this.getPrisma();
            const cleanedBrand = brand.trim();
            const cleanedName = productName.trim();
            const items = await prisma.closetItem.findMany({
                where: { 
                    brand: cleanedBrand,       
                    name: cleanedName,      
                    colorHex: colorHex,
                    imageId: { not: null },
                    deletedAt: null 
                },
                include: { imageAsset: true },
                take: 3
            });

            return items.map(item => `/api/v1/images/${item.imageId}/content`);
        } catch (cause) {
            console.error("🔥 [findRelatedImages] 진짜 DB 에러 상세 내용:", cause);
            throw createReceiptError(500, 'OCR500_03', '연관 이미지를 조회하는 중 서버 오류가 발생했습니다.', cause);
        }
    }

    // [API 3] 일괄 저장
    async saveBatchItems({ userId, items }) {
        if (!items || !Array.isArray(items) || items.length === 0) {
            throw createReceiptError(400, 'OCR400_05', '등록할 상품 정보가 존재하지 않습니다.');
        }
        if (items.length > 5) {
            throw createReceiptError(400, 'OCR400_06', '상품은 한 번에 최대 5개까지만 등록 가능합니다.');
        }

        for (const item of items) {
            if (!item.brand || !item.productName || !item.colorHex) {
                throw createReceiptError(400, 'OCR400_07', '모든 상품의 브랜드, 제품명, 색상 정보는 필수입니다.');
            }
            if (!item.imageId) {
                throw createReceiptError(400, 'OCR400_08', '모든 상품에 이미지를 등록해야 완료할 수 있습니다.');
            }
            if (item.category && !VALID_CATEGORIES.includes(item.category)) {
                throw createReceiptError(400, 'OCR400_09', '유효하지 않은 카테고리 형식이 포함되어 있습니다.');
            }
        }

        const prisma = this.getPrisma();
        const userExists = await prisma.user.findUnique({ where: { id: userId } });
        if (!userExists) {
            throw createReceiptError(404, 'USER404_01', '존재하지 않는 회원입니다.');
        }

        try {
            const resultCount = await prisma.$transaction(async (tx) => {
                let savedCount = 0;

                for (const item of items) {
                    const createdItem = await tx.closetItem.create({
                        data: {
                            userId: userId,
                            imageId: (item.imageId && !isNaN(Number(item.imageId))) ? Number(item.imageId) : null,
                            name: item.productName,
                            category: item.category || '기타',
                            importType: item.importType || 'RECEIPT',
                            brand: item.brand,
                            colorHex: item.colorHex,
                            subCategory: item.subCategory,
                            memo: item.memo
                        }
                    });

                    if (item.tags && item.tags.length > 0) {
                        const tagData = item.tags.map(tagName => ({
                            closetItemId: createdItem.id,
                            tagName: tagName
                        }));
                        await tx.itemTag.createMany({ data: tagData });
                    }
                    savedCount++;
                }

                return savedCount;
            });

            return resultCount;
        } catch (cause) {
            console.error("🔥 진짜 DB 에러 상세 내용:", cause);
            throw createReceiptError(500, 'OCR500_02', '상품 등록 중 서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.', cause);
        }
    }
}
