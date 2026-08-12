import express from 'express';
import { createReceiptController } from '../controllers/receipt.controller.js';
import { uploadReceiptImages } from '../middlewares/image-upload.middleware.js';

export const createReceiptRouter = ({ receiptService, authenticate }) => {
    const router = express.Router();
    const controller = createReceiptController(receiptService);

    router.use(authenticate);
    router.post('/body-profiles/receipt-ocr', uploadReceiptImages, controller.analyzeReceiptOcr);
    router.get('/body-profiles/clothes/search-image', controller.searchClothesImage);
    router.post('/body-profiles/receipt-items', controller.registerBatchClothes);

    return router;
};