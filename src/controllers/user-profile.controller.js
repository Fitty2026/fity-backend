import { sendResponse } from '../middlewares/response.middleware.js';

const userIdOf = (req) => req.auth.userId;

export const createUserProfileController = (userProfileService) => ({
    getMe: async (req, res, next) => {
        try { return sendResponse(res, await userProfileService.getUser(userIdOf(req)), '내 프로필을 조회했습니다.'); }
        catch (error) { return next(error); }
    },
    updateMe: async (req, res, next) => {
        try { return sendResponse(res, await userProfileService.updateUser(userIdOf(req), req.body || {}), '내 프로필을 수정했습니다.'); }
        catch (error) { return next(error); }
    },
    listStyleTags: async (req, res, next) => {
        try { return sendResponse(res, await userProfileService.listStyleTags(), '스타일 태그 목록을 조회했습니다.'); }
        catch (error) { return next(error); }
    },
    saveOnboardingStyles: async (req, res, next) => {
        try { return sendResponse(res, await userProfileService.saveOnboardingStyles(userIdOf(req), req.body || {}), '온보딩 스타일을 저장했습니다.'); }
        catch (error) { return next(error); }
    },
    getBodyProfile: async (req, res, next) => {
        try { return sendResponse(res, await userProfileService.getBodyProfile(userIdOf(req)), '체형 프로필 조회에 성공했습니다.'); }
        catch (error) { return next(error); }
    },

    upsertBodyProfile: async (req, res, next) => {
        try { return sendResponse(res, await userProfileService.upsertBodyProfile(userIdOf(req), req.body || {}), '체형 프로필이 성공적으로 저장되었습니다.'); }
        catch (error) { return next(error); }
    },

    saveBodyProfileType: async (req, res, next) => {
        try { return sendResponse(res, await userProfileService.saveBodyProfileType(userIdOf(req), req.body || {}), '요청에 성공했습니다.'); }
        catch (error) { return next(error); }
    },

    analyzeBodyProfile: async (req, res, next) => {
        try {
            // req.files에는 multer 등으로 들어온 frontImage, sideImage, backImage가 담기게 됨
            const images = req.files || {};
            return sendResponse(res, await userProfileService.analyzeBodyProfile(userIdOf(req), images), '체형 분석에 성공했습니다.');
        } catch (error) { return next(error); }
    },

    saveBodyProfile: async (req, res, next) => {
        try { return sendResponse(res, await userProfileService.saveBodyProfile(userIdOf(req), req.body || {}), '체형 프로필이 성공적으로 저장되었습니다.'); }
        catch (error) { return next(error); }
    }
});
