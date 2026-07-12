import { PrismaClient } from '@prisma/client'; // ORM 계층
// TODO: 사용할 Error 정의 파일 import

const prisma = new PrismaClient();

export class AuthService {
  
  // 회원가입 실제 로직 처리
  public async signupUser(email: string, password: string, nickname: string, agreements: any) {
    // 1. 이메일 중복 체크
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new Error('REQUEST400: 이미 가입된 이메일 주소입니다.'); // 임시 에러 처리 (나중에 common 에러로 교체)
    }

    // 2. 비밀번호 암호화 (TODO: bcrypt 사용)
    const hashedPassword = password; 

    // 3. DB에 유저 생성 (ORM 활용)
    const newUser = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        nickname,
        // agreements 처리 등
      }
    });

    // 4. Controller에게 결과 데이터만 반환
    return {
      userId: newUser.id,
      email: newUser.email,
      nickname: newUser.name,
      createdAt: newUser.createdAt
    };
  }
}