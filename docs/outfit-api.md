# BE4 코디 생성·저장 API 명세

## 공통 인증·소유권 규칙

- 클라이언트용 코디 API는 `Authorization: Bearer <accessToken>` 인증이 필요합니다.
- 사용자 식별은 공통 JWT 미들웨어가 설정한 `req.auth.userId`만 사용합니다.
- body, query, header의 `userId`는 인증·소유권 판단에 사용하지 않습니다.
- 생성 작업, 체형 프로필, 결과, 저장 코디는 인증 사용자 소유 범위에서만 조회·변경합니다.
- 내부 처리 API는 JWT 대신 서버 간 `x-internal-token`을 사용하며 클라이언트가 호출하지 않습니다.

## OUTFIT-01 코디 생성 작업 등록

`POST /api/v1/outfits/generation-jobs`

응답을 반환한 뒤 현재 서버 프로세스가 해당 작업 처리를 비동기로 시작합니다. 클라이언트는 아래 조회 API를 polling합니다.

```json
{
  "closetItemIds": [21, 24],
  "styleTagIds": [1, 3],
  "bodyProfileId": 7
}
```

| 필드 | 형식 | 필수 | 설명 |
| --- | --- | --- | --- |
| `closetItemIds` | positive integer[] | Y | 하나 이상의 소유 옷장 아이템 ID |
| `styleTagIds` | positive integer[] | N | 스타일 태그 ID, 생략 시 빈 배열 |
| `bodyProfileId` | positive integer | N | 인증 사용자 소유 체형 프로필 ID |

중복 ID는 서버에서 한 번만 저장합니다. 생성 성공 응답:

```json
{
  "isSuccess": true,
  "code": "COMMON200",
  "message": "Outfit generation job was created.",
  "result": {
    "jobId": 31,
    "status": "queued",
    "createdAt": "2026-07-26T09:00:00.000Z"
  }
}
```

이 요청은 작업을 `QUEUED`로 저장할 뿐 AI 처리를 자동 시작하지 않습니다.

## OUTFIT-02 코디 생성 작업 조회

`GET /api/v1/outfits/generation-jobs/:jobId`

상태는 `queued`, `processing`, `completed`, `failed` 중 하나입니다.

완료 응답의 `result` 예시:

```json
{
  "jobId": 31,
  "status": "completed",
  "outfitResultId": 9,
  "generatedImage": {
    "outfitResultId": 9,
    "imageUrl": "https://ai.example/outfit.png",
    "provider": "fitty-ai",
    "fallbackUsed": false,
    "recommendedClosetItemIds": [21, 24]
  },
  "failure": null,
  "createdAt": "2026-07-26T09:00:00.000Z",
  "completedAt": "2026-07-26T09:00:05.000Z"
}
```

실패 상태에서는 `generatedImage`가 `null`이고 다음 형식의 원인이 포함됩니다.

```json
{
  "failure": {
    "code": "AI_GENERATION_FAILED",
    "reason": "Outfit result could not be stored."
  }
}
```

## OUTFIT-03 코디 결과 저장

`POST /api/v1/outfits/saved`

```json
{
  "outfitResultId": 9,
  "name": "주말 데일리룩"
}
```

- `outfitResultId`는 인증 사용자 소유 결과여야 합니다.
- `name`은 선택값입니다. 비어 있거나 생략하면 `saved outfit`을 사용하며 최대 120자로 저장합니다.
- 같은 사용자가 같은 결과를 중복 저장하면 `409 / CONFLICT409`를 반환합니다.

성공 응답의 `result` 예시:

```json
{
  "id": 14,
  "savedOutfitId": 14,
  "outfitResultId": 9,
  "name": "주말 데일리룩",
  "imageUrl": "https://ai.example/outfit.png",
  "createdAt": "2026-07-26T09:01:00.000Z",
  "savedAt": "2026-07-26T09:01:00.000Z",
  "isSaved": true
}
```

## OUTFIT-04 저장한 코디 목록 조회

`GET /api/v1/outfits/saved?page=1&size=10`

| query | 기본값 | 제한 |
| --- | ---: | --- |
| `page` | 1 | 1 이상의 정수 |
| `size` | 10 | 1~50의 정수 |

최신 저장순으로 반환합니다.

```json
{
  "items": [],
  "pagination": {
    "page": 1,
    "size": 10,
    "totalCount": 0
  }
}
```

## OUTFIT-05 저장한 코디 삭제

`DELETE /api/v1/outfits/saved/:savedOutfitId`

인증 사용자 소유 저장 레코드만 삭제합니다. 성공 응답의 `result`는 `null`입니다. 원본 생성 결과와 생성 이미지는 삭제하지 않습니다.

## OUTFIT-06 내부 생성 작업 처리

`POST /api/v1/outfits/internal/generation-jobs/:jobId/process`

```http
x-internal-token: <INTERNAL_WORKER_TOKEN>
```

- `INTERNAL_WORKER_TOKEN`이 서버에 설정돼 있고 요청 값과 일치할 때만 호출할 수 있습니다.
- `QUEUED` 작업 하나를 `PROCESSING`으로 선점한 뒤 `AI_OUTFIT_ADAPTER_URL`을 호출합니다.
- AI 응답의 URL 형식과 추천 아이템 ID 배열을 검증하고, 추천 아이템의 사용자 소유권도 다시 확인합니다.
- AI 호출·응답 검증이 실패하면 `FALLBACK_OUTFIT_IMAGE_URL`의 정적 이미지를 fallback으로 사용합니다. 이때 `provider`는 `fitty-fallback`, `fallbackUsed`는 `true`이고 추천 아이템은 요청한 전체 아이템입니다.
- `FALLBACK_OUTFIT_IMAGE_URL`은 `/`로 시작하는 서버 상대 경로 또는 HTTPS URL만 허용합니다. 값이 비어 있거나 허용되지 않는 형식이면 기본 `/fallback/default-outfit.png`를 사용합니다.
- AI 결과 또는 fallback 결과를 저장하면 `COMPLETED`로 종료합니다. 결과 DB 저장·상태 전이 자체가 실패하면 실패 코드·원인을 저장하고 `FAILED`로 종료합니다.
- 이미 선점됐거나 존재하지 않는 작업이면 `result: null`을 반환합니다.

AI 어댑터 요청 body:

```json
{
  "jobId": 31,
  "userId": 7,
  "bodyProfileId": 7,
  "closetItemIds": [21, 24],
  "styleTagIds": [1, 3]
}
```

AI 어댑터 성공 응답 계약:

```json
{
  "generatedImageUrl": "https://ai.example/outfit.png",
  "recommendedClosetItemIds": [21, 24],
  "provider": "fitty-ai"
}
```

## 상태와 오류 코드

| HTTP | 코드 | 의미 |
| --- | --- | --- |
| 400 | `REQUEST400` | ID 배열, bodyProfileId 또는 페이지네이션 형식 오류 |
| 401 | `AUTH401_01` | 클라이언트 JWT 인증 실패 |
| 401 | `AUTH4012` | 내부 처리 토큰 누락·불일치 또는 서버 미설정 |
| 403 | `FORBIDDEN403` | 다른 사용자의 옷장 아이템 포함 |
| 404 | `NOT_FOUND404` | 소유 체형·작업·결과·저장 코디가 없거나 ID가 잘못됨 |
| 409 | `CONFLICT409` | 같은 코디 결과를 이미 저장함 |

AI 관련 오류는 fallback 전환 사유로 처리되므로 그 자체가 작업의 `failure.code`로 노출되지 않습니다. 결과 DB 저장·상태 전이 등 예상하지 못한 최종 실패는 원래 오류 코드 또는 `AI_GENERATION_FAILED`로 저장될 수 있습니다.

## 배포 전 조건

- 운영 MySQL/MariaDB에 코디 관련 마이그레이션을 적용하고 상태 전이·트랜잭션을 실제 DB에서 확인해야 합니다.
- 현재 MVP는 생성 요청 직후 동일 서버 프로세스에서 처리를 시작합니다.
- OUTFIT-06은 수동 재처리 또는 향후 외부 워커 연결용입니다.
- 운영 환경에서는 프로세스 재시작에도 견디는 durable queue/worker가 추가로 필요합니다.
- `AI_OUTFIT_ADAPTER_URL`, timeout, 네트워크 접근, 인증 방식은 실제 AI 서비스와 맞춰 검증해야 합니다. 현재 AI 어댑터 요청에는 별도 인증 헤더가 없습니다.
- 기본 fallback 파일은 `/fallback/default-outfit.png`에서 정적으로 제공됩니다. 커스텀 HTTPS URL을 사용할 경우 실제 접근 가능 여부와 CORS·만료 정책을 확인해야 합니다.
- BE2에는 생성 이미지를 private 저장소에 기록하는 내부 서비스가 있지만, 현재 BE4는 AI가 반환한 외부 URL 또는 정적 fallback URL을 `outfit_results`에 직접 저장합니다. 실제 생성 파일 저장 연결과 shared storage 영속화가 필요합니다.
- 프론트엔드 생성 요청부터 폴링, 내부 처리, 결과 저장·조회까지의 배포 환경 E2E는 별도 검증해야 합니다.
