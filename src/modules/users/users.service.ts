import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class UsersService {
  
  // 내 프로필 조회 비즈니스 로직
  public async getProfile(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      // 관련된 스타일 태그 등 조인해서 가져오기
    });

    if (!user) {
      throw new Error('NOT_FOUND404: 존재하지 않는 회원입니다.');
    }

    return user;
  }

  // 체형 정보 등록 로직 등 추가...
}