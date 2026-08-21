# Fitty Backend

Fitty 2차 과제 MVP의 Node.js/Express 백엔드입니다. 현재 브랜치에는 BE1 인증·사용자/온보딩, BE2 이미지 자산, BE3 옷장, BE4 코디 생성 작업·저장 API가 하나의 Express/Prisma 애플리케이션으로 통합돼 있습니다.

## 2차 과제 백엔드 범위

| 담당 | 현재 구현 |
| --- | --- |
| BE1 | 이메일 회원가입·로그인, JWT 인증, 내 프로필·체형 프로필, 스타일 태그·온보딩 취향 저장 |
| BE2 | private 이미지 업로드, 메타데이터·보호 콘텐츠 조회, 삭제, 생성 결과 이미지 내부 저장 서비스 |
| BE3 | 쇼핑몰 연동 요청 기록, 옷장 아이템 등록·목록·상세·수정·삭제, 사용자 소유권 검증 |
| BE4 | 코디 생성 작업 생성·조회, 내부 처리 엔드포인트, AI HTTP 어댑터, 결과 저장·목록·삭제 |

위 표는 저장소의 코드와 테스트 기준 구현 상태입니다. 빈 MySQL 8.4 대상 마이그레이션과 로그인부터 fallback 코디 저장까지의 백엔드 HTTP E2E는 검증했습니다. 실제 운영 DB, 배포 환경, 프론트엔드 연동, 외부 AI 서비스, 다중 인스턴스 shared storage는 별도 검증이 필요합니다.

## 요구사항

- Node.js 22 이상
- MySQL 또는 MariaDB
- `DATABASE_URL`
- 32자 이상의 `JWT_ACCESS_SECRET`
- 선택: `JWT_ACCESS_EXPIRES_IN` (기본 `7d`)
- 32자 이상의 `IMAGE_URL_SIGNING_SECRET` (미설정 시 `JWT_ACCESS_SECRET` 사용)
- 선택: `IMAGE_URL_TTL_SECONDS` (기본 300초, 최대 3600초)
- BE4 처리용 `INTERNAL_WORKER_TOKEN`
- 외부 AI 연동 시 `AI_OUTFIT_ADAPTER_URL`
- 선택: `AI_OUTFIT_ADAPTER_TIMEOUT_MS` (기본 10,000ms)
- 선택: `FALLBACK_OUTFIT_IMAGE_URL` (기본 `/fallback/default-outfit.png`)

## 실행

```bash
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:validate
npm start
```

개발 중에는 `npm run dev`를 사용합니다. DB 마이그레이션은 팀 DB 연결 정보를 설정한 뒤 `npx prisma migrate deploy`로 적용합니다.

마이그레이션에는 `users`, `image_assets`, 사용자·온보딩, 옷장, 코디 생성·저장 관련 테이블이 포함됩니다. 이미 별도 방식으로 만든 팀 DB가 있다면 적용 전에 migration baseline과 기존 데이터 백필 여부를 확인해야 합니다.

## 시연용 공용 옷장

`.env`의 `DEMO_CLOSET_SOURCE_USER_ID`에 시연용 원본 옷장을 보유한 계정 ID를 설정하면, 신규 가입자에게 원본 옷장 아이템과 이미지가 자동으로 복제됩니다.

기존 계정에도 원본 옷장을 추가하려면 아래 명령을 실행합니다.

```bash
npm run demo:closet:sync
```

원본 데이터가 바뀐 뒤 기존에 복제된 시연용 데이터만 교체하려면 아래 명령을 사용합니다. 개인이 직접 등록한 옷장 아이템은 유지됩니다.

```bash
npm run demo:closet:sync -- --replace
```

## 검증

```bash
npm test
npm run prisma:validate
git diff --check
```

## 주요 API

| Method | Path | 설명 |
| --- | --- | --- |
| POST | `/api/v1/auth/signup` | 회원가입 (토큰 미발급, 별도 로그인 필요) |
| POST | `/api/v1/auth/login` | 이메일 로그인 및 액세스 토큰 발급 |
| GET/PATCH | `/api/v1/users/me` | 내 프로필 조회·수정 |
| POST | `/api/v1/users/agreements` | 약관 동의 저장 |
| GET | `/api/v1/body-profiles/me` | 내 체형 프로필 조회 |
| POST | `/api/v1/body-profiles/type` | 온보딩 체형 타입 저장 |
| POST | `/api/v1/images/upload` | 사용자 이미지 영속 저장 |
| GET | `/api/v1/images/:imageId` | 소유자 전용 메타데이터 조회 |
| GET | `/api/v1/images/:imageId/content` | 소유자 전용 이미지 바이트 조회 |
| DELETE | `/api/v1/images/:imageId` | 소유자 전용 이미지 삭제 |
| POST | `/api/v1/closets/sync` | 쇼핑몰 연동 동의·요청 기록 |
| POST/GET | `/api/v1/closets/items` | 옷장 아이템 등록·목록 조회 |
| GET/PATCH/DELETE | `/api/v1/closets/items/:itemId` | 옷장 아이템 상세·수정·삭제 |
| POST | `/api/v1/outfits/generation-jobs` | 코디 생성 작업 등록 |
| GET | `/api/v1/outfits/generation-jobs/:jobId` | 코디 생성 상태·결과 조회 |
| POST/GET | `/api/v1/outfits/saved` | 코디 결과 저장·목록 조회 |
| DELETE | `/api/v1/outfits/saved/:savedOutfitId` | 저장한 코디 삭제 |
| GET | `/api/v1/style-tags` | 온보딩 스타일 태그 ID·명칭 조회 |
| POST | `/api/v1/users/onboarding/style` | 인증 사용자의 스타일 취향 즉시 저장 |
| GET | `/health` | 서버와 실제 DB 연결 상태 확인 |

세부 계약은 [인증 API 명세](docs/auth-api.md), [사용자·온보딩 API 명세](docs/user-profile-api.md), [이미지 API 명세](docs/image-upload-api.md), [옷장 API 명세](docs/closet-api.md), [코디 API 명세](docs/outfit-api.md)를 참고합니다.

## 운영·통합 경계

- 이미지의 개발 기본값은 private 로컬 디렉터리 `var/images`입니다. 다중 인스턴스 배포 전에는 S3/R2 계열 shared storage 어댑터가 필요합니다.
- 생성 요청 직후 단일 서버 프로세스에서 작업을 비동기로 시작합니다. 내부 처리 API는 수동 재처리·외부 워커 연결용이며 `INTERNAL_WORKER_TOKEN`이 필요합니다. 운영 환경에서 재시작에도 견디는 durable queue/worker는 아직 없습니다.
- 외부 AI 호출이 실패하거나 설정되지 않으면 BE4는 `FALLBACK_OUTFIT_IMAGE_URL`의 정적 이미지를 fallback 결과로 사용합니다. 기본 이미지는 `/fallback/default-outfit.png`에서 제공합니다.
- BE2에는 생성 결과 파일을 저장하는 내부 서비스가 있지만, 현재 BE4는 AI가 반환한 외부 URL 또는 정적 fallback URL을 결과에 저장합니다. 실제 생성 파일 저장 연결과 generated image의 shared storage 영속화는 후속 통합 대상입니다.
- `/health`는 연결된 DB에 `SELECT 1`을 실행하지만, 로컬 테스트 통과만으로 운영 DB 마이그레이션이나 배포 성공을 보장하지 않습니다.

보호 API는 공통 JWT 미들웨어가 검증한 `req.auth.userId`만 사용합니다. 임시 사용자 헤더나 요청 body의 `userId`는 인증·소유권 판단에 사용하지 않으며, 인증 컨텍스트가 없으면 fail-closed로 `401`을 반환합니다.
