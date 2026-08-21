import { sendResponse } from '../middlewares/response.middleware.js';

export const createGenerationJob = async (req, res, next) => {
    try {
        const job = await req.app.locals.outfitService.createGenerationJob(
            req.auth.userId,
            req.body,
            req.get('idempotency-key')
        );
        return sendResponse(res, job, 'Outfit generation job was created.');
    } catch (error) {
        return next(error);
    }
};
export const getGenerationJob = async (req, res, next) => { try { return sendResponse(res, await req.app.locals.outfitService.getGenerationJob(req.auth.userId, req.params.jobId)); } catch (error) { return next(error); } };
export const getActiveGenerationJob = async (req, res, next) => { try { return sendResponse(res, await req.app.locals.outfitService.getActiveGenerationJob(req.auth.userId)); } catch (error) { return next(error); } };
export const createRevision = async (req, res, next) => {
    try {
        const revision = await req.app.locals.outfitService.createRevision(
            req.auth.userId,
            req.params.outfitResultId,
            req.body,
            req.get('idempotency-key')
        );
        return sendResponse(res, revision, 'Outfit revision job was created.');
    } catch (error) { return next(error); }
};
export const saveOutfit = async (req, res, next) => { try { return sendResponse(res, await req.app.locals.outfitService.saveOutfit(req.auth.userId, req.body), 'Outfit was saved.'); } catch (error) { return next(error); } };
export const getSavedOutfits = async (req, res, next) => { try { return sendResponse(res, await req.app.locals.outfitService.getSavedOutfits(req.auth.userId, req.query)); } catch (error) { return next(error); } };
export const getDeletedSavedOutfits = async (req, res, next) => { try { return sendResponse(res, await req.app.locals.outfitService.getDeletedSavedOutfits(req.auth.userId, req.query)); } catch (error) { return next(error); } };
export const getSavedOutfit = async (req, res, next) => { try { return sendResponse(res, await req.app.locals.outfitService.getSavedOutfit(req.auth.userId, req.params.savedOutfitId)); } catch (error) { return next(error); } };
export const updateSavedOutfit = async (req, res, next) => { try { return sendResponse(res, await req.app.locals.outfitService.updateSavedOutfit(req.auth.userId, req.params.savedOutfitId, req.body), 'Saved outfit was updated.'); } catch (error) { return next(error); } };
export const likeSavedOutfit = async (req, res, next) => { try { return sendResponse(res, await req.app.locals.outfitService.setSavedOutfitLike(req.auth.userId, req.params.savedOutfitId, true), 'Saved outfit was liked.'); } catch (error) { return next(error); } };
export const unlikeSavedOutfit = async (req, res, next) => { try { return sendResponse(res, await req.app.locals.outfitService.setSavedOutfitLike(req.auth.userId, req.params.savedOutfitId, false), 'Saved outfit like was removed.'); } catch (error) { return next(error); } };
export const deleteSavedOutfit = async (req, res, next) => { try { return sendResponse(res, await req.app.locals.outfitService.deleteSavedOutfit(req.auth.userId, req.params.savedOutfitId), 'Saved outfit was deleted.'); } catch (error) { return next(error); } };
export const restoreSavedOutfit = async (req, res, next) => { try { return sendResponse(res, await req.app.locals.outfitService.restoreSavedOutfit(req.auth.userId, req.params.savedOutfitId), 'Saved outfit was restored.'); } catch (error) { return next(error); } };
export const permanentlyDeleteSavedOutfit = async (req, res, next) => { try { return sendResponse(res, await req.app.locals.outfitService.permanentlyDeleteSavedOutfit(req.auth.userId, req.params.savedOutfitId), 'Saved outfit was permanently deleted.'); } catch (error) { return next(error); } };
export const processGenerationJob = async (req, res, next) => { try { const job = await req.app.locals.outfitService.processGenerationJob(req.params.jobId); return sendResponse(res, job ? { jobId: job.id, status: job.status.toLowerCase() } : null); } catch (error) { return next(error); } };
