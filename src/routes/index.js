import express from 'express';
import * as exampleController from '../controllers/example.controller.js';
import { createAuthRouter } from './auth.routes.js';
import { createImageRouter } from './image.routes.js';

export const createIndexRouter = (dependencies) => {
    const router = express.Router();

    router.get('/example', exampleController.getExample);
    router.use('/v1/auth', createAuthRouter({ authService: dependencies.authService }));
    router.use('/v1/images', createImageRouter(dependencies));

    return router;
};
