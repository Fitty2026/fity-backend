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
    logout: async (req, res, next) => {
        try {
            return sendResponse(res, null, '로그아웃에 성공했습니다.');
        } catch (error) {
            return next(error);
        }
    },
    socialLogin: async (req, res, next) => {
        try {
            const result = await authService.socialLogin(req.body || {});
            return sendResponse(res, result, '소셜 로그인에 성공했습니다.');
        } catch (error) {
            return next(error);
        }
    }
});
