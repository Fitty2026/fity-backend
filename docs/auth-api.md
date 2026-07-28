# BE1 인증 API

## 환경 변수

`JWT_ACCESS_SECRET`은 32자 이상의 무작위 비밀값이어야 합니다. 개발/운영 환경마다 다른 값을 사용하고 저장소에 커밋하지 않습니다. `JWT_ACCESS_EXPIRES_IN`은 선택값이며 기본값은 `7d`입니다.

## 회원가입

`POST /api/v1/auth/signup`

```json
{
  "name": "홍길동",
  "username": "fitty1234",
  "email": "user@example.com",
  "password": "at-least-8-characters"
}
```

- `name`: 1~191자
- `username`: 4~30자의 영문·숫자, 소문자로 정규화되는 고유값
- `email`: 유효한 이메일 형식, 고유값
- `password`: 8~72자

회원가입 단계에서는 약관 동의 값을 받지 않습니다. 약관 동의는 로그인 이후 별도 흐름과 API로 분리합니다.

비밀번호는 bcrypt 해시로만 저장됩니다. 이메일은 소문자와 공백 제거 후 고유하게 저장합니다. 성공 결과는 다음 형식이며 비밀번호나 해시는 반환하지 않습니다.

```json
{
  "accessToken": "<JWT_TOKEN>",
  "tokenType": "Bearer",
  "user": {
    "id": 7,
    "username": "fitty1234",
    "email": "user@example.com",
    "name": "홍길동"
  }
}
```

## 로그인

`POST /api/v1/auth/login`

```json
{ "email": "user@example.com", "password": "at-least-8-characters" }
```

로그인은 아이디가 아닌 이메일을 사용합니다. 존재하지 않는 이메일과 잘못된 비밀번호에는 모두 `AUTH4012`를 반환합니다.

현재 로그아웃은 클라이언트가 저장한 액세스 토큰을 삭제하는 방식입니다. 서버 측 토큰 무효화 저장소가 없으므로 별도 로그아웃 API는 제공하지 않습니다.

## 보호된 API

`Authorization: Bearer <accessToken>` 헤더를 전송합니다. 공통 미들웨어가 HS256 서명, 만료시간, `sub` 사용자 ID를 검증한 뒤에만 `req.auth.userId`를 설정합니다. 헤더가 없거나 위조·만료된 토큰은 `AUTH4011`로 거부합니다.

## 기존 사용자 데이터

`password_hash`는 기존 `users` 레코드를 보존하기 위해 nullable로 추가됩니다. 해시가 없는 기존 계정은 비밀번호 로그인이 불가하므로, 배포 전에 비밀번호 재설정/계정 마이그레이션 정책을 마련해야 합니다.

`username`도 기존 사용자 레코드를 보존하기 위해 DB에서는 일시적으로 nullable입니다. 신규 회원가입 API에서는 필수이며, 기존 사용자 아이디를 백필한 뒤 후속 마이그레이션에서 NOT NULL로 전환합니다.
