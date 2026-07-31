# BE4 코디 생성·저장 API 명세

## 공통 규칙

- Base URL: `/api/v1/outfits`
- 클라이언트 API는 `Authorization: Bearer <JWT_TOKEN>` 인증이 필요합니다.
- 사용자 식별은 공통 JWT 미들웨어가 설정한 `req.auth.userId`만 사용합니다.
- 요청의 `userId`, `bodyProfileId`는 인증 및 소유권 판단에 사용하지 않습니다.
- 성공 및 실패 응답은 `{ isSuccess, code, message, result }` 공통 형식을 사용합니다.
- 다른 사용자의 리소스는 소유권 노출 방지를 위해 `NOT_FOUND404`로 응답할 수 있습니다.

## OUTFIT-01 코디 생성 요청

`POST /api/v1/outfits/generation-jobs`

```json
{
  "closetItemIds": [21, 24],
  "styleTagIds": [1, 3],
  "situation": "DATE",
  "selectedDate": "2026-07-31",
  "weather": {
    "temperature": 28,
    "condition": "SUNNY"
  }
}
```

| 필드 | 필수 | 규칙 |
| --- | --- | --- |
| `closetItemIds` | Y | 인증 사용자가 소유한 옷장 아이템 ID, 1개 이상 |
| `styleTagIds` | N | 사용자 프로필에 저장된 스타일 태그 ID |
| `situation` | N | `DATE`, `WORK`, `SCHOOL`, `TRAVEL` |
| `selectedDate` | N | 실제 달력에 존재하는 `YYYY-MM-DD`, 과거·미래 범위 제한 없음 |
| `weather` | N | 날씨 객체 |
| `weather.temperature` | N | 유한한 number |
| `weather.condition` | weather 사용 시 Y | `SUNNY`, `CLOUDY`, `RAINY`, `SNOWY`, `WINDY`, `UNKNOWN` |

체형 프로필은 서버가 JWT 사용자 기준으로 조회합니다. active 체형 프로필이 없으면 `NOT_FOUND404`를 반환합니다. `rain`은 클라이언트에서 받지 않고 AI 요청 시 서버가 `condition`을 기준으로 파생합니다.

화면에서 기온을 제공하지 않으면 `weather`에는 `condition`만 전달해도 됩니다. `temperature`는 선택값입니다.

`selectedDate`에는 서버 기준 과거·미래 범위 제한을 두지 않습니다. 형식이 잘못됐거나 실제 달력에 존재하지 않는 날짜만 `REQUEST400`으로 거부합니다.

```json
{
  "weather": {
    "condition": "WINDY"
  }
}
```

사용자당 `queued`, `processing`, `qc_pending` 작업은 1개만 허용합니다. 진행 중 작업이 있으면 새 작업을 만들지 않고 `isExistingJob: true`로 기존 작업과 기존 입력 snapshot을 반환합니다.

```json
{
  "jobId": 31,
  "status": "queued",
  "progress": 5,
  "isExistingJob": false,
  "input": {
    "closetItemIds": [21, 24],
    "styleTagIds": [1, 3],
    "situation": "DATE",
    "selectedDate": "2026-07-31",
    "weather": { "temperature": 28, "condition": "SUNNY" }
  },
  "expiresAt": "2026-07-31T12:10:00.000Z",
  "createdAt": "2026-07-31T12:00:00.000Z",
  "completedAt": null
}
```

## OUTFIT-02 작업 상태 조회

`GET /api/v1/outfits/generation-jobs/:jobId`

정상 처리 순서는 `queued(5) -> processing(70) -> qc_pending(90) -> completed(100)`입니다. `failed`, `expired`도 종료 상태입니다.

```json
{
  "jobId": 31,
  "status": "processing",
  "progress": 70,
  "expiresAt": "2026-07-31T12:10:00.000Z",
  "outfitResultId": null,
  "generatedImage": null,
  "failure": null,
  "createdAt": "2026-07-31T12:00:00.000Z",
  "completedAt": null
}
```

완료 시 `generatedImage`에 `outfitResultId`, `imageUrl`, `provider`, `fallbackUsed`, `recommendedClosetItemIds`가 포함됩니다. 진행 중 작업이 생성 후 10분을 초과하면 `expired/JOB_TIMEOUT`, 미저장 완료 결과가 24시간을 초과하면 `expired/RESULT_EXPIRED`로 전환됩니다.

두 만료 모두 HTTP 오류가 아니라 `COMMON200` 정상 조회 응답으로 반환합니다. FE는 `status: expired`에서 `failure.code`를 확인해 진행 시간 초과와 결과 보관 만료를 구분합니다.

```json
{
  "failure": {
    "code": "JOB_TIMEOUT",
    "message": "Outfit generation job expired."
  }
}
```

FE 권장 polling 주기는 2초입니다. `completed`, `failed`, `expired`에서 polling을 종료합니다.

## OUTFIT-03 내 진행 중 작업 조회

`GET /api/v1/outfits/generation-jobs/active`

진행 중 작업이 있으면 OUTFIT-01과 같은 입력 snapshot을 포함해 반환합니다. 없으면 `COMMON200`의 `result: null`을 반환합니다.

## OUTFIT-04 아이템 교체 및 재생성

`POST /api/v1/outfits/:outfitResultId/revisions`

```json
{
  "replaceItemId": 21,
  "newItemId": 35
}
```

- 원본 결과와 두 아이템은 인증 사용자 소유여야 합니다.
- `replaceItemId`는 원본 코디에 포함되어야 합니다.
- 교체 전후 아이템의 category가 같아야 합니다.
- category가 다르면 `409 ITEM_NOT_COMPATIBLE`을 반환합니다.
- 진행 중인 생성 작업이 있으면 `409 CONFLICT409`를 반환합니다.
- 원본 결과는 유지되고 새 결과가 별도 생성됩니다.

```json
{
  "revisionId": 3,
  "jobId": 34,
  "parentOutfitResultId": 9,
  "status": "queued",
  "progress": 5,
  "createdAt": "2026-07-31T13:00:00.000Z",
  "expiresAt": "2026-07-31T13:10:00.000Z"
}
```

생성 상태와 결과는 OUTFIT-02로 조회합니다.
재생성이 완료되면 OUTFIT-02가 반환한 새 `outfitResultId`를 SAVED-01의 `outfitResultId`로 전달해 저장합니다. 원본 결과와 재생성 결과의 저장 방식은 동일합니다.

## SAVED-01 코디 저장

`POST /api/v1/outfits/saved`

```json
{
  "outfitResultId": 9,
  "name": "주말 데일리룩",
  "tags": ["데이트", "여름"],
  "memo": "흰색 운동화와 함께 입기"
}
```

- `outfitResultId`는 필수이며 완료된 본인 소유 결과여야 합니다.
- `name`은 선택값이며 최대 20자입니다. 생략 시 서버가 `YYYY-MM-DD outfit` 형식으로 생성합니다.
- `tags`는 선택 문자열 배열이며 최대 5개입니다.
- `memo`는 선택값이며 최대 200자입니다.
- 동일 결과를 중복 저장하면 `CONFLICT409`를 반환합니다.
- 24시간 보관 기간이 지난 미저장 결과는 저장할 수 없습니다.

## SAVED-02 저장 코디 목록

`GET /api/v1/outfits/saved?page=1&size=10`

- `page`: 1 이상의 정수, 기본 1
- `size`: 1~50 정수, 기본 10
- soft delete되지 않은 본인 코디만 최신순으로 반환합니다.

각 항목에는 `id`, `savedOutfitId`, `outfitResultId`, `name`, `imageUrl`, `items`, `styleTags`, `tags`, `memo`, `createdAt`, `updatedAt`, `deletedAt`, `isSaved`가 포함됩니다.

## SAVED-03 저장 코디 상세

`GET /api/v1/outfits/saved/:savedOutfitId`

soft delete되지 않은 본인 소유 코디 한 건을 SAVED-02 항목과 같은 구조로 반환합니다.

## SAVED-04 저장 코디 정보 수정

`PATCH /api/v1/outfits/saved/:savedOutfitId`

```json
{
  "name": "수정한 이름",
  "tags": ["출근"],
  "memo": "수정 메모"
}
```

`name`, `tags`, `memo` 중 하나 이상이 필요하며 SAVED-01과 같은 길이 제한을 적용합니다.

## SAVED-05 저장 코디 삭제

`DELETE /api/v1/outfits/saved/:savedOutfitId`

레코드를 즉시 제거하지 않고 `deletedAt`을 기록합니다.

```json
{
  "savedOutfitId": 14,
  "deletedAt": "2026-07-31T14:00:00.000Z"
}
```

## SAVED-06 최근 삭제 목록

`GET /api/v1/outfits/saved/deleted?page=1&size=10`

본인의 `deletedAt != null`인 코디만 `deletedAt` 최신순으로 반환합니다.

## SAVED-07 삭제 코디 복구

`POST /api/v1/outfits/saved/:savedOutfitId/restore`

```json
{
  "savedOutfitId": 14,
  "deletedAt": null,
  "restoredAt": "2026-07-31T14:10:00.000Z"
}
```

## SAVED-08 영구 삭제

`DELETE /api/v1/outfits/saved/:savedOutfitId/permanent`

먼저 soft delete된 본인 코디만 영구 삭제할 수 있습니다. 성공 결과는 `null`입니다. 자동 영구 삭제 보관 기간은 정책 확정 전까지 적용하지 않습니다.

## 내부 처리 및 복구 worker

`POST /api/v1/outfits/internal/generation-jobs/:jobId/process`

내부 요청은 `x-internal-token: <INTERNAL_WORKER_TOKEN>`이 필요합니다. 서버는 요청 직후 비동기 처리를 시작하며, 별도 polling worker가 DB의 유효한 `QUEUED` 작업을 다시 수거합니다. 따라서 요청 직후 프로세스가 재시작되어도 DB에 남은 작업을 복구할 수 있습니다.

- `OUTFIT_WORKER_POLL_INTERVAL_MS`: polling 주기, 기본 1000ms
- `OUTFIT_WORKER_BATCH_SIZE`: 한 번에 조회할 작업 수, 기본 5, 최대 20
- 원자적 `QUEUED -> PROCESSING` 전환으로 여러 worker가 같은 작업을 중복 처리하지 않습니다.
- AI 호출이 실패하거나 응답이 잘못되면 정적 fallback 결과를 저장합니다.
- AI 및 fallback 결과 저장 자체가 실패하면 job을 `failed`로 전환합니다.

## 주요 오류 코드

| HTTP | 코드 | 의미 |
| --- | --- | --- |
| 400 | `REQUEST400` | path, query, body 형식 오류 |
| 401 | `AUTH401_01` | JWT 또는 내부 인증 실패 |
| 403 | `FORBIDDEN403` | 다른 사용자의 옷장 아이템 요청 |
| 404 | `NOT_FOUND404` | 리소스가 없거나 소유자가 아님 |
| 409 | `CONFLICT409` | 현재 상태에서 처리할 수 없음 |
| 409 | `ITEM_NOT_COMPATIBLE` | 교체 아이템 category 불일치 |

상태 내부 오류인 `JOB_TIMEOUT`, `RESULT_EXPIRED`, `AI_GENERATION_FAILED`는 OUTFIT-02의 `failure.code`로 반환합니다.
