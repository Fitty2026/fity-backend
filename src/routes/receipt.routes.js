import express from 'express';
import { createReceiptController } from '../controllers/receipt.controller.js';
import { uploadReceiptImages } from '../middlewares/image-upload.middleware.js';

export const createReceiptRouter = ({ receiptService, authenticate }) => {
    const router = express.Router();
    const controller = createReceiptController(receiptService);

    router.post('/body-profiles/receipt-ocr', authenticate, uploadReceiptImages, controller.analyzeReceiptOcr);
    router.get('/body-profiles/clothes/search-image', authenticate, controller.searchClothesImage);
    router.post('/body-profiles/receipt-items', authenticate, controller.registerBatchClothes);

    return router;
};
