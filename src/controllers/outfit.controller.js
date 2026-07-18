import * as outfitService from "../services/outfit.service.js";
import { sendResponse } from "../middlewares/response.middleware.js";

export const createGenerationJob = async (req, res, next) => {
    try {
        const data = await outfitService.createGenerationJob(req.body);
        return sendResponse(res, data, "코디 생성 요청이 접수되었습니다.");
    } catch (error) {
        next(error);
    }
};

export const getGenerationJob = async (req, res, next) => {
    try {
        const data = await outfitService.getGenerationJob(req.params.jobId);
        return sendResponse(res, data, "요청에 성공했습니다.");
    } catch (error) {
        next(error);
    }
};

export const saveOutfit = async (req, res, next) => {
    try {
        const data = await outfitService.saveOutfit(req.body);
        return sendResponse(res, data, "코디가 저장되었습니다.");
    } catch (error) {
        next(error);
    }
};

export const getSavedOutfits = async (req, res, next) => {
    try {
        const data = await outfitService.getSavedOutfits(req.query);
        return sendResponse(res, data, "요청에 성공했습니다.");
    } catch (error) {
        next(error);
    }
};

export const deleteSavedOutfit = async (req, res, next) => {
    try {
        const data = await outfitService.deleteSavedOutfit(req.params.savedOutfitId);
        return sendResponse(res, data, "저장한 코디가 삭제되었습니다.");
    } catch (error) {
        next(error);
    }
};
