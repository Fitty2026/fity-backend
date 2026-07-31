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
        try {
            await userProfileService.saveOnboardingStyles(userIdOf(req), req.body || {});
            return sendResponse(res, null, '온보딩 스타일을 저장했습니다.');
        }
        catch (error) { return next(error); }
    },
    getBodyProfile: async (req, res, next) => {
        try { return sendResponse(res, await userProfileService.getBodyProfile(userIdOf(req)), '체형 프로필을 조회했습니다.'); }
        catch (error) { return next(error); }
    },
    saveBodyType: async (req, res, next) => {
        try { return sendResponse(res, await userProfileService.saveBodyType(userIdOf(req), req.body || {}), '체형 타입을 저장했습니다.'); }
        catch (error) { return next(error); }
    },
    analyzeBodyProfile: async (req, res, next) => {
        try { return sendResponse(res, await userProfileService.analyzeBodyProfile(userIdOf(req), req.body || {}), '체형 사진을 분석했습니다.'); }
        catch (error) { return next(error); }
    },
    saveAgreements: async (req, res, next) => {
        try {
            await userProfileService.saveAgreements(userIdOf(req), req.body || {});
            return sendResponse(res, null, '약관 동의를 저장했습니다.');
        }
        catch (error) { return next(error); }
    }
});
