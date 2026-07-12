import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { SuccessResponse } from '../../common/responses/success.response';
// TODO: common/errors 에서 예외 처리 클래스 가져오기

export class AuthController {
  private authService = new AuthService();

  // [AUTH-01] 이메일 회원가입 (POST /api/v1/auth/signup)
  public signup = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password, nickname, agreements } = req.body;
      
      // 비즈니스 로직은 Service에게 토스!
      const result = await this.authService.signupUser(email, password, nickname, agreements);
      
      // 공통 응답 포맷으로 성공 반환
      return res.status(200).json(new SuccessResponse('COMMON200', '회원가입에 성공했습니다.', result));
    } catch (error) {
      next(error); // 에러 발생 시 공통 에러 미들웨어로 전달
    }
  };

  // [AUTH-02] 이메일 로그인 (POST /api/v1/auth/login)
  public login = async (req: Request, res: Response, next: NextFunction) => {
    // TODO: 로그인 로직 작성
  };

  // [AUTH-03] 소셜 로그인 (POST /api/v1/auth/social)
  public socialLogin = async (req: Request, res: Response, next: NextFunction) => {
    // TODO: 소셜 로그인 로직 작성
  };

  // [AUTH-04] 로그아웃 (POST /api/v1/auth/logout)
  public logout = async (req: Request, res: Response, next: NextFunction) => {
    // TODO: 로그아웃 로직 작성
  };
}