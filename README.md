# Fitty Backend

Fitty MVP의 Node.js/Express 백엔드입니다. 현재 브랜치에는 BE2 이미지 자산 업로드·조회·보호 콘텐츠 조회·삭제와 생성 결과 이미지 내부 저장 서비스가 구현돼 있습니다.

## 요구사항

- Node.js 22 이상
- MySQL 또는 MariaDB
- `DATABASE_URL`
- BE1 인증 미들웨어가 주입하는 `req.auth.userId` (`number`)

## 실행

```bash
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:validate
npm start
```

개발 중에는 `npm run dev`를 사용합니다. DB 마이그레이션은 팀 DB 연결 정보를 설정한 뒤 `npx prisma migrate deploy`로 적용합니다.

현재 첫 마이그레이션에는 기존 예시 `users`와 신규 `image_assets`가 함께 포함됩니다. 이미 별도 방식으로 만든 팀 DB가 있다면 적용 전에 migration baseline 여부를 확인해야 합니다.

## 검증

```bash
npm test
npm run prisma:validate
git diff --check
```

## 주요 API

| Method | Path | 설명 |
| --- | --- | --- |
| POST | `/api/v1/images/upload` | 사용자 이미지 영속 저장 |
| GET | `/api/v1/images/:imageId` | 소유자 전용 메타데이터 조회 |
| GET | `/api/v1/images/:imageId/content` | 소유자 전용 이미지 바이트 조회 |
| DELETE | `/api/v1/images/:imageId` | 소유자 전용 이미지 삭제 |
| GET | `/health` | 서버와 실제 DB 연결 상태 확인 |

세부 계약은 [이미지 API 명세](docs/image-upload-api.md)를 참고합니다.

## 저장소 경계

개발 기본값은 private 로컬 디렉터리 `var/images`입니다. 저장 키는 API 응답에 노출하지 않으며 콘텐츠는 인증된 API를 통해서만 전달합니다. 다중 인스턴스 배포 전에는 같은 저장소 인터페이스를 사용하는 S3/R2 계열 어댑터로 교체해야 합니다.

BE1 인증 PR이 아직 확정되지 않았으므로 현재 기본 라우터는 인증 컨텍스트가 없으면 fail-closed로 `401`을 반환합니다. 임시 사용자 헤더나 요청 body의 `userId`는 사용하지 않습니다.
