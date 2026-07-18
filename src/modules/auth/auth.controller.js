import { AuthService } from './auth.service.js';
import { sendResponse } from '../../middlewares/response.middleware.js'; 

export class AuthController {
  constructor() {
    this.authService = new AuthService();
  }

  // [AUTH-01] 이메일 회원가입
  signup = async (req, res, next) => {
    try {
      const { email, password, name, agreements } = req.body; 
      
      const result = await this.authService.signupUser(email, password, name, agreements);
      
      // 공통 응답 포맷으로 성공 반환 (res, data, message 순서)
      return sendResponse(res, result, '회원가입에 성공했습니다.');
    } catch (error) {
      next(error); 
    }
  };

  // [AUTH-02] 이메일 로그인
  login = async (req, res, next) => {
    try {
      const mockResult = { token: "임시_로그인_토큰_값" };
      return sendResponse(res, mockResult, '로그인 로직 미구현 (스켈레톤 응답)');
    } catch (error) {
      next(error);
    }
  };

  // [AUTH-03] 소셜 로그인
  socialLogin = async (req, res, next) => {
    try {
      const mockResult = { token: "임시_소셜로그인_토큰_값" };
      return sendResponse(res, mockResult, '소셜 로그인 로직 미구현 (스켈레톤 응답)');
    } catch (error) {
      next(error);
    }
  };

  // [AUTH-04] 로그아웃
  logout = async (req, res, next) => {
    try {
      return sendResponse(res, null, '로그아웃 성공 (스켈레톤 응답)');
    } catch (error) {
      next(error);
    }
  };
}