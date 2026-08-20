import { sendResponse } from '../middlewares/response.middleware.js';

const userIdOf = (req) => req.auth.userId;

export const createUserProfileController = (userProfileService) => ({
    getMe: async (req, res, next) => {
        try { return sendResponse(res, await userProfileService.getUser(userIdOf(req)), '내 프로필을 조회했습니다.'); }
        catch (error) { return next(error); }
    },
    updateMe: async (req, res, next) => {
        try { return sendResponse(res, await userProfileService.updateProfile(userIdOf(req), req.body || {}), '내 프로필을 수정했습니다.'); }
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
    analyzeBodyProfile: async (req, res, next) => {
        try { const result = await userProfileService.analyzeBodyProfile(userIdOf(req), req.files || {});
            return sendResponse(res, result, '체형 사진을 분석했습니다.'); }
        catch (error) { return next(error); }
    },
    saveBodyProfile: async (req, res, next) => {
        try { const result = await userProfileService.saveBodyProfile(userIdOf(req), req.body);
            return sendResponse(res, result, '체형 프로필이 성공적으로 저장되었습니다.'); } 
        catch (error) { return next(error); }
    },
    saveAgreements: async (req, res, next) => {
        try { await userProfileService.saveAgreements(userIdOf(req), req.body || {});
            return sendResponse(res, null, '약관 동의를 저장했습니다.'); }
        catch (error) { return next(error); }
    },
    updateProfile: async (req, res, next) => {
        try {
            const userId = req.auth.userId; 
            const result = await userProfileService.updateProfile(userId, req.body);

            return res.status(200).json({
                isSuccess: true,
                code: 'COMMON200',
                message: '프로필 정보 수정에 성공했습니다.',
                result
            });
        } catch (error) {
            next(error);
        }
    },

    withdrawUser: async (req, res, next) => {
        try {
            const userId = req.auth.userId;
            const result = await userProfileService.withdrawUser(userId);
            
            return sendResponse(res, result, '회원 탈퇴 처리가 완료되었습니다.');
        } catch (error) {
            return next(error);
        }
    }
});
