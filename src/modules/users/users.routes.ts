import { Router } from 'express';
import { UsersController } from './users.controller';

const router = Router();
const usersController = new UsersController();

// === [User / Onboarding] ===
// POST /api/v1/users/onboarding/style
router.post('/users/onboarding/style', usersController.saveOnboardingStyle);

// DELETE /api/v1/users/withdraw
router.delete('/users/withdraw', usersController.withdraw);


// === [Profile] ===
// GET /api/v1/users/me
router.get('/users/me', usersController.getMyProfile);

// PUT /api/v1/users/me
router.put('/users/me', usersController.updateMyProfile);


// === [Body Profile] === 
// POST /api/v1/body-profiles
router.post('/body-profiles', usersController.createBodyProfile);

// GET /api/v1/body-profiles/me
router.get('/body-profiles/me', usersController.getMyBodyProfile);

export default router;