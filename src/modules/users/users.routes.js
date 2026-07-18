import { Router } from 'express';
import { UsersController } from './users.controller.js'; 

const router = Router();
const usersController = new UsersController();

// === [User / Onboarding] ===
// 온보딩 스타일 저장 (POST /api/v1/users/onboarding/style)
router.post('/users/onboarding/style', usersController.saveOnboardingStyle);

// 회원 탈퇴 (DELETE /api/v1/users/withdraw)
router.delete('/users/withdraw', usersController.withdraw);


// === [Profile] ===
// 내 프로필 정보 조회 (GET /api/v1/users/me)
router.get('/users/me', usersController.getMyProfile);

// 내 프로필 정보 수정 (PUT /api/v1/users/me)
router.put('/users/me', usersController.updateMyProfile);


// === [Body Profile] === 
// 체형 프로필 등록 (POST /api/v1/body-profiles)
router.post('/body-profiles', usersController.createBodyProfile);

// 체형 프로필 정보 조회 (GET /api/v1/body-profiles/me)
router.get('/body-profiles/me', usersController.getMyBodyProfile);

export default router;