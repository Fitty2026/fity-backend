import express from 'express';
import * as controller from '../controllers/outfit.controller.js';

const internalOnly = (token) => (req, res, next) => {
    if (!token || req.get('x-internal-token') !== token) {
        const error = new Error('Internal authorization is required.'); error.status = 401; error.code = 'AUTH4012'; return next(error);
    }
    return next();
};

export const createOutfitRouter = ({ authenticate, internalToken }) => {
    const router = express.Router();
    router.post('/generation-jobs', authenticate, controller.createGenerationJob);
    router.get('/generation-jobs/:jobId', authenticate, controller.getGenerationJob);
    router.post('/saved', authenticate, controller.saveOutfit);
    router.get('/saved', authenticate, controller.getSavedOutfits);
    router.delete('/saved/:savedOutfitId', authenticate, controller.deleteSavedOutfit);
    router.post('/internal/generation-jobs/:jobId/process', internalOnly(internalToken), controller.processGenerationJob);
    return router;
};
