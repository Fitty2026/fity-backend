import { sendResponse } from '../middlewares/response.middleware.js';

export const createGenerationJob = async (req, res, next) => { try { return sendResponse(res, await req.app.locals.outfitService.createGenerationJob(req.auth.userId, req.body), 'Outfit generation job was created.'); } catch (error) { return next(error); } };
export const getGenerationJob = async (req, res, next) => { try { return sendResponse(res, await req.app.locals.outfitService.getGenerationJob(req.auth.userId, req.params.jobId)); } catch (error) { return next(error); } };
export const saveOutfit = async (req, res, next) => { try { return sendResponse(res, await req.app.locals.outfitService.saveOutfit(req.auth.userId, req.body), 'Outfit was saved.'); } catch (error) { return next(error); } };
export const getSavedOutfits = async (req, res, next) => { try { return sendResponse(res, await req.app.locals.outfitService.getSavedOutfits(req.auth.userId, req.query)); } catch (error) { return next(error); } };
export const deleteSavedOutfit = async (req, res, next) => { try { return sendResponse(res, await req.app.locals.outfitService.deleteSavedOutfit(req.auth.userId, req.params.savedOutfitId), 'Saved outfit was deleted.'); } catch (error) { return next(error); } };
export const processGenerationJob = async (req, res, next) => { try { const job = await req.app.locals.outfitService.processGenerationJob(req.params.jobId); return sendResponse(res, job ? { jobId: job.id, status: job.status.toLowerCase() } : null); } catch (error) { return next(error); } };
