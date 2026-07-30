import { sendResponse } from '../middlewares/response.middleware.js';

export const createAuthController = (authService) => ({
    signup: async (req, res, next) => {
        try {
            const result = await authService.signup(req.body || {});
            return sendResponse(res, result, '회원가입에 성공했습니다.');
        } catch (error) {
            return next(error);
        }
    },
    login: async (req, res, next) => {
        try {
            const result = await authService.login(req.body || {});
            return sendResponse(res, result, '로그인에 성공했습니다.');
        } catch (error) {
            return next(error);
        }
    },
    saveAgreements: async (req, res, next) => {
        try {
            const userId = req.auth?.userId || req.body?.userId; // 인증된 유저 ID 또는 요청 바디의 ID 활용
            const result = await authService.saveAgreements(userId, req.body || {});
            return sendResponse(res, result, '약관 동의가 완료되었습니다.');
        } catch (error) {
            return next(error);
        }
    }
});
