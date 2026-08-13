import express from 'express';
import * as exampleController from '../controllers/example.controller.js';
import { createAuthRouter } from './auth.routes.js';
import { createImageRouter } from './image.routes.js';
import { createClosetRouter } from './closet.route.js';
import { createOutfitRouter } from './outfit.routes.js';
import { createUserProfileRouter } from './user-profile.routes.js';
import { createPuzzleRouter } from './puzzle.routes.js';
import { createReceiptRouter } from './receipt.routes.js';

export const createIndexRouter = (dependencies) => {
    const router = express.Router();

    router.get('/example', exampleController.getExample);
    router.use('/v1/auth', createAuthRouter({ authService: dependencies.authService }));
    router.use('/v1/images', createImageRouter(dependencies));
    router.use('/v1/closets', createClosetRouter(dependencies));
    router.use('/v1', createUserProfileRouter(dependencies));
    router.use('/v1/outfits', createOutfitRouter(dependencies));
    router.use('/v1/puzzles', createPuzzleRouter(dependencies));
    router.use('/v1', createReceiptRouter(dependencies));

    return router;
};
