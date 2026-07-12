import { Request, Response, NextFunction } from 'express';
import { UsersService } from './users.service';
import { SuccessResponse } from '../../common/responses/success.response';

export class UsersController {
  private usersService = new UsersService();

  // [USER-01] 온보딩 스타일 저장 (POST /api/v1/users/onboarding/style)
  public saveOnboardingStyle = async (req: Request, res: Response, next: NextFunction) => { /* ... */ };

  // [USER-02] 회원 탈퇴 (DELETE /api/v1/users/withdraw)
  public withdraw = async (req: Request, res: Response, next: NextFunction) => { /* ... */ };

  // [PROFILE-01] 내 프로필 정보 조회 (GET /api/v1/users/me)
  public getMyProfile = async (req: Request, res: Response, next: NextFunction) => { /* ... */ };

  // [PROFILE-02] 내 프로필 정보 수정 (PUT /api/v1/users/me)
  public updateMyProfile = async (req: Request, res: Response, next: NextFunction) => { /* ... */ };

  // [PROFILE-03] 체형 프로필 등록 (POST /api/v1/body-profiles)
  public createBodyProfile = async (req: Request, res: Response, next: NextFunction) => { /* ... */ };

  // [PROFILE-04] 체형 프로필 정보 조회 (GET /api/v1/body-profiles/me)
  public getMyBodyProfile = async (req: Request, res: Response, next: NextFunction) => { /* ... */ };
}