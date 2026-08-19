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
            const input = { 
                ...(req.body || {}), 
                provider: req.params.provider 
            };
            const result = await authService.socialLogin(input);
            return sendResponse(res, result, '소셜 로그인에 성공했습니다.');
        } catch (error) {
            return next(error);
        }
    },
    requestPasswordResetCode: async (req, res, next) => {
        try {
            await authService.requestPasswordResetCode(req.body || {});
            return sendResponse(res, null, '인증번호가 발송되었습니다.');
        } catch (error) {
            return next(error);
        }
    },
    verifyPasswordResetCode: async (req, res, next) => {
        try {
            const result = await authService.verifyPasswordResetCode(req.body || {});
            return sendResponse(res, result, '인증이 완료되었습니다.');
        } catch (error) {
            return next(error);
        }
    },
    resetPassword: async (req, res, next) => {
        try {
            const authHeader = req.headers.authorization;
            const resetToken = authHeader && authHeader.startsWith('Bearer ') 
                ? authHeader.split(' ')[1] 
                : null;
            const input = {
                ...(req.body || {}),
                resetToken
            };
            
            await authService.resetPassword(input);
            return sendResponse(res, null, '비밀번호가 성공적으로 변경되었습니다.');
        } catch (error) {
            return next(error);
        }
    }
});
