import * as outfitService from "../services/outfit.service.js";
import { sendResponse } from "../middlewares/response.middleware.js";

export const createGenerationJob = async (req, res, next) => {
    try {
        const data = await outfitService.createGenerationJob(req.auth.userId, req.body);
        return sendResponse(res, data, "Outfit generation job was created.");
    } catch (error) {
        next(error);
    }
};

export const getGenerationJob = async (req, res, next) => {
    try {
        const data = await outfitService.getGenerationJob(req.auth.userId, req.params.jobId);
        return sendResponse(res, data, "Request succeeded.");
    } catch (error) {
        next(error);
    }
};

export const saveOutfit = async (req, res, next) => {
    try {
        const data = await outfitService.saveOutfit(req.auth.userId, req.body);
        return sendResponse(res, data, "Outfit was saved.");
    } catch (error) {
        next(error);
    }
};

export const getSavedOutfits = async (req, res, next) => {
    try {
        const data = await outfitService.getSavedOutfits(req.auth.userId, req.query);
        return sendResponse(res, data, "Request succeeded.");
    } catch (error) {
        next(error);
    }
};

export const deleteSavedOutfit = async (req, res, next) => {
    try {
        const data = await outfitService.deleteSavedOutfit(req.auth.userId, req.params.savedOutfitId);
        return sendResponse(res, data, "Saved outfit was deleted.");
    } catch (error) {
        next(error);
    }
};
