import express from 'express';
import { createUserProfileController } from '../controllers/user-profile.controller.js';
import { uploadBodyProfileImages } from '../middlewares/image-upload.middleware.js';

export const createUserProfileRouter = ({ userProfileService, authenticate }) => {
    const router = express.Router();
    const controller = createUserProfileController(userProfileService);

    router.get('/users/me', authenticate, controller.getMe);
    router.patch('/users/me', authenticate, controller.updateProfile);
    router.delete('/users/me', authenticate, controller.withdrawUser);
    router.post('/users/agreements', authenticate, controller.saveAgreements);
    router.get('/style-tags', authenticate, controller.listStyleTags);
    router.post('/users/onboarding/style', authenticate, controller.saveOnboardingStyles);
    router.get('/body-profiles/me', authenticate, controller.getBodyProfile);
    router.post('/body-profiles/analyze', authenticate, uploadBodyProfileImages, controller.analyzeBodyProfile);
    router.post('/body-profiles', authenticate, controller.saveBodyProfile);
    return router;
};
