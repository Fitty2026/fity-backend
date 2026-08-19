import express from 'express';
import { createAuthController } from '../controllers/auth.controller.js';

export const createAuthRouter = ({ authService }) => {
    const router = express.Router();
    const controller = createAuthController(authService);

    router.post('/signup', controller.signup);
    router.post('/login', controller.login);
    router.post('/logout', controller.logout);
    router.post('/social/:provider', controller.socialLogin);
    router.post('/password/code-request', controller.requestPasswordResetCode);
    router.post('/password/code-verify', controller.verifyPasswordResetCode);
    router.patch('/password/reset', controller.resetPassword);
    return router;
};
