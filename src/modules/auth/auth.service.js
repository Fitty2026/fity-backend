import prisma from '../../config/prisma.js'; 

export class AuthService {
  
  async signupUser(email, password, name, agreements) {
    // 1. 이메일 중복 체크
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new Error('REQUEST400: 이미 가입된 이메일 주소입니다.');
    }

    // 2. 비밀번호 원문 저장 제거
    // TODO: 추후 bcrypt 등을 활용해 암호화된 해시값만 취급하도록 로직 추가 필요.
    // 현재는 DB 모델과 계약을 맞추기 위해 생성 객체에서 제외함.

    // 3. DB에 유저 생성
    const newUser = await prisma.user.create({
      data: {
        email: email,
        name: name,
        // agreements 처리 등 추후 추가
      }
    });

    // 4. Controller에게 결과 데이터만 반환
    return {
      userId: newUser.id,
      email: newUser.email,
      name: newUser.name,
      createdAt: newUser.createdAt
    };
  }
}