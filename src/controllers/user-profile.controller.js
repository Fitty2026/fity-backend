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
    saveOnboardingStyles: async (req, res, next) => {
        try { return sendResponse(res, await userProfileService.updateUser(userIdOf(req), { styleTags: req.body?.styles }), '온보딩 스타일을 저장했습니다.'); }
        catch (error) { return next(error); }
    },
    getBodyProfile: async (req, res, next) => {
        try { return sendResponse(res, await userProfileService.getBodyProfile(userIdOf(req)), '체형 프로필을 조회했습니다.'); }
        catch (error) { return next(error); }
    },
    upsertBodyProfile: async (req, res, next) => {
        try { return sendResponse(res, await userProfileService.upsertBodyProfile(userIdOf(req), req.body || {}), '체형 프로필을 저장했습니다.'); }
        catch (error) { return next(error); }
    }
});
