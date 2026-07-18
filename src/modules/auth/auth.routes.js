import { Router } from 'express';
import { AuthController } from './auth.controller.js';
const router = Router();
const authController = new AuthController();

// POST /api/v1/auth/signup ➔ 회원가입 함수 실행
router.post('/signup', authController.signup);

// POST /api/v1/auth/login ➔ 로그인 함수 실행
router.post('/login', authController.login);

// POST /api/v1/auth/social ➔ 소셜 로그인 함수 실행
router.post('/social', authController.socialLogin);

// POST /api/v1/auth/logout ➔ 로그아웃 함수 실행
router.post('/logout', authController.logout);

export default router;