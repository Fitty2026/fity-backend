import prisma from '../../config/prisma.js'; 

export class UsersService {
  
  // 온보딩 스타일 저장 로직
  async saveOnboardingStyle(userId, styles) {
    // 유저 테이블의 스타일 태그 컬럼에 문자열로 변환하여 저장
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        styleTags: JSON.stringify(styles) 
      }
    });
    return updatedUser;
  }

  // 회원 탈퇴 로직
  async withdrawUser(userId) {
    // 유저 고유 ID 기준으로 해당 데이터베이스 열 삭제
    const deletedUser = await prisma.user.delete({
      where: { id: userId }
    });
    return deletedUser;
  }

  // 내 프로필 조회 로직
  async getProfile(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('NOT_FOUND404: 존재하지 않는 회원입니다.');
    }

    return user;
  }

  // 내 프로필 수정 로직
  async updateProfile(userId, updateData) {
    // 유저 정보를 새로 넘어온 데이터(updateData)로 갱신
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData
    });
    return updatedUser;
  }

  // 체형 프로필 등록 로직
  async createBodyProfile(userId, bodyData) {
    // bodyProfile 테이블에 현재 로그인 유저 ID와 체형 정보를 결합하여 생성
    const bodyProfile = await prisma.bodyProfile.create({
      data: {
        userId: userId,
        ...bodyData
      }
    });
    return bodyProfile;
  }

  // 체형 프로필 조회 로직
  async getBodyProfile(userId) {
    // 해당 유저의 가장 최근 혹은 등록된 체형 프로필 한 건 조회
    const bodyProfile = await prisma.bodyProfile.findFirst({
      where: { userId: userId }
    });
    return bodyProfile;
  }
}