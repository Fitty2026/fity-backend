# BE1 인증 API

## 환경 변수

`JWT_ACCESS_SECRET`은 32자 이상의 무작위 비밀값이어야 합니다. 개발/운영 환경마다 다른 값을 사용하고 저장소에 커밋하지 않습니다. `JWT_ACCESS_EXPIRES_IN`은 선택값이며 기본값은 `7d`입니다.

## 회원가입

`POST /api/v1/auth/signup`

```json
{ "email": "user@example.com", "password": "at-least-8-characters", "name": "홍길동" }
```

비밀번호는 bcrypt 해시로만 저장됩니다. 이메일은 소문자와 공백 제거 후 고유하게 저장합니다. 성공 결과는 `accessToken`, `tokenType` (`Bearer`), 공개 사용자 정보만 반환하며 비밀번호나 해시는 반환하지 않습니다.

## 로그인

`POST /api/v1/auth/login`

회원가입과 같은 `email`, `password` 형식으로 요청합니다. 존재하지 않는 이메일과 잘못된 비밀번호에는 모두 `AUTH4012`를 반환합니다.

## 보호된 API

`Authorization: Bearer <accessToken>` 헤더를 전송합니다. 공통 미들웨어가 HS256 서명, 만료시간, `sub` 사용자 ID를 검증한 뒤에만 `req.auth.userId`를 설정합니다. 헤더가 없거나 위조·만료된 토큰은 `AUTH4011`로 거부합니다.

## 기존 사용자 데이터

`password_hash`는 기존 `users` 레코드를 보존하기 위해 nullable로 추가됩니다. 해시가 없는 기존 계정은 비밀번호 로그인이 불가하므로, 배포 전에 비밀번호 재설정/계정 마이그레이션 정책을 마련해야 합니다.
