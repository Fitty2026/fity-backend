import express from 'express';
import { createAuthController } from '../controllers/auth.controller.js';

export const createAuthRouter = ({ authService }) => {
    const router = express.Router();
    const controller = createAuthController(authService);

    router.post('/signup', controller.signup);
    router.post('/login', controller.login);
    router.post('/users/agreements', controller.saveAgreements);

    return router;
};
