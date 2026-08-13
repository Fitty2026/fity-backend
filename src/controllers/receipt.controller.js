import { sendResponse } from '../middlewares/response.middleware.js';

const createReceiptError = (status, code, message) => {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    return error;
};

export const createReceiptController = (receiptService) => ({

    // [API 1] OCR 처리
    analyzeReceiptOcr: async (req, res, next) => {
        try {
            const files = req.files;
            const { importType, platform } = req.body;

            if (!files || files.length === 0) {
                throw createReceiptError(400, 'OCR400_01', '영수증 캡처 이미지는 필수 입력 항목입니다.');
            }
            if (files.length > 5) {
                throw createReceiptError(400, 'OCR400_02', '영수증 이미지는 최대 5장까지만 업로드 가능합니다.');
            }

            const result = await receiptService.processOcr({ files, importType, platform });

            return sendResponse(res, result, 'OCR 분석에 성공했습니다.');
        } catch (error) {
            return next(error);
        }
    },

    // [API 2] 연관 의류 이미지 조회
    searchClothesImage: async (req, res, next) => {
        try {
            const { brand, productName, colorHex } = req.query;
            if (!brand || !productName || !colorHex) {
                throw createReceiptError(400, 'OCR400_10', '필수 검색 조건(브랜드, 제품명, 색상)이 누락되었습니다.');
            }

            const images = await receiptService.findRelatedImages({ brand, productName, colorHex });

            return sendResponse(res, { images }, '연관 의류 이미지 조회에 성공했습니다.');
        } catch (error) {
            return next(error);
        }
    },

    // [API 3] 의류 일괄 저장
    registerBatchClothes: async (req, res, next) => {
        try {
            const userId = req.auth.userId; 
            const { items } = req.body;

            if (!items || items.length === 0) {
                throw createReceiptError(400, 'OCR400_05', '등록할 상품 정보가 존재하지 않습니다.');
            }
            if (items.length > 5) {
                throw createReceiptError(400, 'OCR400_06', '상품은 한 번에 최대 5개까지만 등록 가능합니다.');
            }

            const hasMissingImage = items.some(item => !item.imageId);
            if (hasMissingImage) {
                throw createReceiptError(400, 'OCR400_08', '모든 상품에 이미지를 등록해야 완료할 수 있습니다.');
            }

            const registeredCount = await receiptService.saveBatchItems({ userId, items });

            return sendResponse(res, { registeredCount }, '옷장 온보딩 상품 등록이 완료되었습니다.');
        } catch (error) {
            return next(error);
        }
    }
});