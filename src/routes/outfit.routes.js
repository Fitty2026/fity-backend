import express from 'express';
import * as controller from '../controllers/outfit.controller.js';

const internalOnly = (token) => (req, res, next) => {
    if (!token || req.get('x-internal-token') !== token) {
        const error = new Error('Internal authorization is required.'); error.status = 401; error.code = 'AUTH401_01'; return next(error);
    }
    return next();
};

export const createOutfitRouter = ({ authenticate, internalToken }) => {
    const router = express.Router();
    router.post('/generation-jobs', authenticate, controller.createGenerationJob);
    router.get('/generation-jobs/active', authenticate, controller.getActiveGenerationJob);
    router.get('/generation-jobs/:jobId', authenticate, controller.getGenerationJob);
    router.post('/:outfitResultId/revisions', authenticate, controller.createRevision);
    router.post('/saved', authenticate, controller.saveOutfit);
    router.get('/saved', authenticate, controller.getSavedOutfits);
    router.get('/saved/deleted', authenticate, controller.getDeletedSavedOutfits);
    router.post('/saved/:savedOutfitId/restore', authenticate, controller.restoreSavedOutfit);
    router.delete('/saved/:savedOutfitId/permanent', authenticate, controller.permanentlyDeleteSavedOutfit);
    router.get('/saved/:savedOutfitId', authenticate, controller.getSavedOutfit);
    router.patch('/saved/:savedOutfitId', authenticate, controller.updateSavedOutfit);
    router.delete('/saved/:savedOutfitId', authenticate, controller.deleteSavedOutfit);
    router.post('/internal/generation-jobs/:jobId/process', internalOnly(internalToken), controller.processGenerationJob);
    return router;
};
