import express from 'express';
import { createUserProfileController } from '../controllers/user-profile.controller.js';

export const createUserProfileRouter = ({ userProfileService, authenticate }) => {
    const router = express.Router();
    const controller = createUserProfileController(userProfileService);

    router.use(authenticate);
    router.get('/users/me', controller.getMe);
    router.patch('/users/me', controller.updateMe);
    router.get('/style-tags', controller.listStyleTags);
    router.post('/users/onboarding/style', controller.saveOnboardingStyles);
    router.get('/body-profiles/me', controller.getBodyProfile);
    router.put('/body-profiles/me', controller.upsertBodyProfile);
    return router;
};
