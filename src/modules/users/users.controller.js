import { UsersService } from './users.service.js';
import { sendResponse } from '../../middlewares/response.middleware.js';

export class UsersController {
  constructor() {
    this.usersService = new UsersService();
  }

  // [USER-01] 온보딩 스타일 저장
  saveOnboardingStyle = async (req, res, next) => {
    try {
      const userId = req.userId || Number(req.headers['x-user-id']) || 1;
      const { styles } = req.body; // 선택한 스타일 태그 데이터
      
      const result = await this.usersService.saveOnboardingStyle(userId, styles);
      
      return sendResponse(res, 200, {
        message: "온보딩 스타일 저장 성공",
        data: result
      });
    } catch (error) {
      next(error); // 에러 발생 시 공통 에러 핸들러로 전달
    }
  };

  // [USER-02] 회원 탈퇴
  withdraw = async (req, res, next) => {
    try {
      const userId = req.userId || Number(req.headers['x-user-id']) || 1;
      
      const result = await this.usersService.withdrawUser(userId);
      
      return sendResponse(res, 200, {
        message: "회원 탈퇴 완료",
        data: result
      });
    } catch (error) {
      next(error);
    }
  };

  // [PROFILE-01] 내 프로필 정보 조회
  getMyProfile = async (req, res, next) => {
    try {
      const userId = req.userId || Number(req.headers['x-user-id']) || 1;
      
      const profile = await this.usersService.getProfile(userId);
      
      return sendResponse(res, 200, {
        message: "프로필 조회 성공",
        data: profile
      });
    } catch (error) {
      next(error);
    }
  };

  // [PROFILE-02] 내 프로필 정보 수정
  updateMyProfile = async (req, res, next) => {
    try {
      const userId = req.userId || Number(req.headers['x-user-id']) || 1;
      const updateData = req.body; // 수정할 데이터 바디
      
      const updatedProfile = await this.usersService.updateProfile(userId, updateData);
      
      return sendResponse(res, 200, {
        message: "프로필 수정 성공",
        data: updatedProfile
      });
    } catch (error) {
      next(error);
    }
  };

  // [PROFILE-03] 체형 프로필 등록
  createBodyProfile = async (req, res, next) => {
    try {
      const userId = req.userId || Number(req.headers['x-user-id']) || 1;
      const bodyData = req.body; // 키, 몸무게 등 체형 데이터
      
      const bodyProfile = await this.usersService.createBodyProfile(userId, bodyData);
      
      return sendResponse(res, 201, {
        message: "체형 프로필 등록 성공",
        data: bodyProfile
      });
    } catch (error) {
      next(error);
    }
  };

  // [PROFILE-04] 체형 프로필 정보 조회
  getMyBodyProfile = async (req, res, next) => {
    try {
      const userId = req.userId || Number(req.headers['x-user-id']) || 1;
      
      const bodyProfile = await this.usersService.getBodyProfile(userId);
      
      return sendResponse(res, 200, {
        message: "체형 프로필 조회 성공",
        data: bodyProfile
      });
    } catch (error) {
      next(error);
    }
  };
}