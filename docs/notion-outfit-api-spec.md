# BE4 Notion API specification

## Table rows

| Index | 기능 | Method | API PATH |
| --- | --- | --- | --- |
| OUTFIT-01 | 코디 생성 요청 | POST | `/api/v1/outfits/generation-jobs` |
| OUTFIT-02 | 코디 생성 작업 상태 조회 | GET | `/api/v1/outfits/generation-jobs/:jobId` |
| OUTFIT-03 | 내 진행 중 코디 생성 작업 조회 | GET | `/api/v1/outfits/generation-jobs/active` |
| OUTFIT-04 | 코디 아이템 교체 및 재생성 | POST | `/api/v1/outfits/:outfitResultId/revisions` |
| SAVED-01 | 코디 저장 | POST | `/api/v1/outfits/saved` |
| SAVED-02 | 저장한 코디 목록 조회 | GET | `/api/v1/outfits/saved` |
| SAVED-03 | 저장한 코디 상세 조회 | GET | `/api/v1/outfits/saved/:savedOutfitId` |
| SAVED-04 | 저장한 코디 정보 수정 | PATCH | `/api/v1/outfits/saved/:savedOutfitId` |
| SAVED-05 | 저장한 코디 삭제 | DELETE | `/api/v1/outfits/saved/:savedOutfitId` |
| SAVED-06 | 최근 삭제 코디 목록 조회 | GET | `/api/v1/outfits/saved/deleted` |
| SAVED-07 | 최근 삭제 코디 복구 | POST | `/api/v1/outfits/saved/:savedOutfitId/restore` |
| SAVED-08 | 최근 삭제 코디 영구 삭제 | DELETE | `/api/v1/outfits/saved/:savedOutfitId/permanent` |

- 모든 행의 파트는 `BE4`, 담당자는 `수정 권`입니다.
- 새 행과 아직 병합되지 않은 변경은 `개발중`으로 두고 PR 및 CI 통과 후 `개발완료`로 변경합니다.

## Common

### Header

```json
{
  "Authorization": "Bearer <JWT_TOKEN>"
}
```

### Success format

```json
{
  "isSuccess": true,
  "code": "COMMON200",
  "message": "Request succeeded.",
  "result": {}
}
```

### Error format

```json
{
  "isSuccess": false,
  "code": "REQUEST400",
  "message": "Error message",
  "result": null
}
```

## Existing rows to update

## OUTFIT-01 - 코디 생성 요청

- Method: `POST`
- Path: `/api/v1/outfits/generation-jobs`
- Part: `BE4`
- Path Variable: 없음
- Query String: 없음

### Request Body

```json
{
  "closetItemIds": [21, 24],
  "styleTagIds": [1, 3],
  "situation": "DATE",
  "selectedDate": "2026-07-31",
  "weather": {
    "condition": "WINDY"
  }
}
```

- `closetItemIds`: 필수, 본인 소유 옷장 아이템 ID 배열, 1~3개
- `styleTagIds`: 선택, USER-04 (`GET /api/v1/users/me`) 응답의 `styleTagIds`
- `situation`: 선택, `DATE`, `WORK`, `SCHOOL`, `TRAVEL`
- `selectedDate`: 선택, 실제 달력에 존재하는 `YYYY-MM-DD`. 과거·미래 범위 제한 없음
- `weather`: 선택
- `weather.condition`: weather 사용 시 필수, `SUNNY`, `CLOUDY`, `RAINY`, `SNOWY`, `WINDY`, `UNKNOWN`
- `weather.temperature`: 선택, 유한한 number. 화면에 기온이 없으면 생략 가능
- `bodyProfileId`, `userId`, `rain`은 요청하지 않음
- 범위 밖 날짜 개념은 없으며 형식 오류나 존재하지 않는 날짜만 `REQUEST400` 반환

### Response Body

```json
{
  "isSuccess": true,
  "code": "COMMON200",
  "message": "Outfit generation job was created.",
  "result": {
    "jobId": 31,
    "status": "queued",
    "progress": 5,
    "isExistingJob": false,
    "input": {
      "closetItemIds": [21, 24],
      "styleTagIds": [1, 3],
      "situation": "DATE",
      "selectedDate": "2026-07-31",
      "weather": { "condition": "WINDY" }
    },
    "expiresAt": "2026-07-31T12:10:00.000Z",
    "createdAt": "2026-07-31T12:00:00.000Z",
    "completedAt": null
  }
}
```

- 진행 중 job이 있으면 새로 생성하지 않고 같은 구조에 `isExistingJob: true`로 기존 job과 기존 input을 반환
- 체형 프로필은 JWT 사용자 기준으로 서버가 조회

### Error

- `400 REQUEST400`: 요청 body 또는 enum 형식 오류
- `401 AUTH401_01`: JWT 없음, 위조 또는 만료
- `403 FORBIDDEN403`: 본인 소유가 아닌 옷장 아이템 포함
- `404 NOT_FOUND404`: active 체형 프로필 또는 스타일 선호 태그 없음

## OUTFIT-02 - 코디 생성 작업 상태 조회

- Method: `GET`
- Path: `/api/v1/outfits/generation-jobs/:jobId`
- Path Variable: `jobId` - 양의 정수
- Query String: 없음
- Request Body: 없음

### Response Body

```json
{
  "isSuccess": true,
  "code": "COMMON200",
  "message": "Request succeeded.",
  "result": {
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
}
```

- 정상 순서: `queued(5) -> processing(70) -> qc_pending(90) -> completed(100)`
- 종료 상태: `completed`, `failed`, `expired`
- FE polling 권장 주기: 2초
- 완료 시 `generatedImage`에 `outfitResultId`, `imageUrl`, `provider`, `fallbackUsed`, `recommendedClosetItemIds` 포함
- 10분 초과 진행 작업: `expired`, `failure.code: JOB_TIMEOUT`
- 24시간 초과 미저장 결과: `expired`, `failure.code: RESULT_EXPIRED`
- 두 만료 모두 HTTP 오류가 아닌 `COMMON200` 정상 응답이며 `failure.code`로 원인을 구분

### Error

- `400 REQUEST400`: jobId 형식 오류
- `401 AUTH401_01`: 인증 실패
- `404 NOT_FOUND404`: job이 없거나 소유자가 아님

## SAVED-01 - 코디 저장

- Method: `POST`
- Path: `/api/v1/outfits/saved`
- Path Variable: 없음
- Query String: 없음

### Request Body

```json
{
  "outfitResultId": 9,
  "name": "주말 데일리룩",
  "tags": ["데이트", "여름"],
  "memo": "흰색 운동화와 함께 입기"
}
```

- `outfitResultId`: 필수, 완료된 본인 소유 결과
- `name`: 선택, 최대 20자
- `tags`: 선택, 문자열 최대 5개
- `memo`: 선택, 최대 200자
- 교체·재생성 결과도 OUTFIT-02의 새 `outfitResultId`를 동일하게 전달해 저장

### Response Body

```json
{
  "isSuccess": true,
  "code": "COMMON200",
  "message": "Outfit was saved.",
  "result": {
    "id": 14,
    "savedOutfitId": 14,
    "outfitResultId": 9,
    "name": "주말 데일리룩",
    "imageUrl": "https://example.com/outfit.png",
    "items": [21, 24],
    "styleTags": [1, 3],
    "tags": ["데이트", "여름"],
    "memo": "흰색 운동화와 함께 입기",
    "createdAt": "2026-07-31T14:00:00.000Z",
    "updatedAt": "2026-07-31T14:00:00.000Z",
    "deletedAt": null,
    "isSaved": true
  }
}
```

### Error

- `400 REQUEST400`: 필드 형식 또는 길이 오류
- `401 AUTH401_01`: 인증 실패
- `404 NOT_FOUND404`: 결과가 없거나 소유자가 아니거나 보관 기간 만료
- `409 CONFLICT409`: 이미 저장한 결과

## SAVED-02 - 저장한 코디 목록 조회

- Method: `GET`
- Path: `/api/v1/outfits/saved`
- Path Variable: 없음
- Query String: `page` 기본 1, `size` 기본 10 및 최대 50
- Request Body: 없음

### Response Body

```json
{
  "isSuccess": true,
  "code": "COMMON200",
  "message": "Request succeeded.",
  "result": {
    "items": [],
    "pagination": { "page": 1, "size": 10, "totalCount": 0 }
  }
}
```

### Error

- `400 REQUEST400`: page 또는 size 형식·범위 오류
- `401 AUTH401_01`: 인증 실패

## SAVED-03 - 저장한 코디 상세 조회

- Method: `GET`
- Path: `/api/v1/outfits/saved/:savedOutfitId`
- Path Variable: `savedOutfitId` - 양의 정수
- Query String: 없음
- Request Body: 없음
- Response Body: SAVED-01의 `result`와 동일

### Error

- `400 REQUEST400`: ID 형식 오류
- `401 AUTH401_01`: 인증 실패
- `404 NOT_FOUND404`: 저장 코디가 없거나 소유자가 아니거나 삭제됨

## SAVED-04 - 저장한 코디 정보 수정

- Method: `PATCH`
- Path: `/api/v1/outfits/saved/:savedOutfitId`
- Path Variable: `savedOutfitId` - 양의 정수
- Query String: 없음

### Request Body

```json
{
  "name": "수정한 이름",
  "tags": ["출근"],
  "memo": "수정 메모"
}
```

- `name`, `tags`, `memo` 중 하나 이상 필수
- Response Body: 수정된 SAVED-01의 `result` 구조

### Error

- `400 REQUEST400`: 수정 필드 없음 또는 형식·길이 오류
- `401 AUTH401_01`: 인증 실패
- `404 NOT_FOUND404`: 저장 코디가 없거나 소유자가 아니거나 삭제됨

## SAVED-05 - 저장한 코디 삭제

- Method: `DELETE`
- Path: `/api/v1/outfits/saved/:savedOutfitId`
- Path Variable: `savedOutfitId` - 양의 정수
- Query String: 없음
- Request Body: 없음

### Response Body

```json
{
  "isSuccess": true,
  "code": "COMMON200",
  "message": "Saved outfit was deleted.",
  "result": {
    "savedOutfitId": 14,
    "deletedAt": "2026-07-31T14:00:00.000Z"
  }
}
```

### Error

- `400 REQUEST400`: ID 형식 오류
- `401 AUTH401_01`: 인증 실패
- `404 NOT_FOUND404`: 저장 코디가 없거나 소유자가 아니거나 이미 삭제됨

## New rows to add

## OUTFIT-03 - 내 진행 중 코디 생성 작업 조회

- Method: `GET`
- Path: `/api/v1/outfits/generation-jobs/active`
- Path Variable: 없음
- Query String: 없음
- Request Body: 없음
- Response Body: 진행 중 job이 있으면 OUTFIT-01의 `result`와 같은 job, input, expiresAt 구조
- 진행 중 job이 없으면 `COMMON200`과 `result: null`

### Error

- `401 AUTH401_01`: 인증 실패

## OUTFIT-04 - 코디 아이템 교체 및 재생성

- Method: `POST`
- Path: `/api/v1/outfits/:outfitResultId/revisions`
- Path Variable: `outfitResultId` - 원본 코디 결과 ID
- Query String: 없음

### Request Body

```json
{
  "replaceItemId": 21,
  "newItemId": 35
}
```

### Response Body

```json
{
  "isSuccess": true,
  "code": "COMMON200",
  "message": "Outfit revision job was created.",
  "result": {
    "revisionId": 3,
    "jobId": 34,
    "parentOutfitResultId": 9,
    "status": "queued",
    "progress": 5,
    "createdAt": "2026-07-31T13:00:00.000Z",
    "expiresAt": "2026-07-31T13:10:00.000Z"
  }
}
```

- OUTFIT-02로 새 job의 완료 상태와 새 `outfitResultId` 조회
- 새 결과 저장은 SAVED-01 사용

### Error

- `400 REQUEST400`: ID 형식 오류, 같은 아이템, 원본에 없는 교체 아이템
- `401 AUTH401_01`: 인증 실패
- `404 NOT_FOUND404`: 결과 또는 아이템이 없거나 소유자가 아님
- `409 ITEM_NOT_COMPATIBLE`: 교체 아이템 category 불일치
- `409 CONFLICT409`: 진행 중인 생성 job 존재

## SAVED-06 - 최근 삭제 코디 목록 조회

- Method: `GET`
- Path: `/api/v1/outfits/saved/deleted`
- Path Variable: 없음
- Query String: `page` 기본 1, `size` 기본 10 및 최대 50
- Request Body: 없음
- Response Body: SAVED-02와 동일하며 `deletedAt`이 있는 항목만 최신 삭제순 반환

### Error

- `400 REQUEST400`: page 또는 size 형식·범위 오류
- `401 AUTH401_01`: 인증 실패

## SAVED-07 - 최근 삭제 코디 복구

- Method: `POST`
- Path: `/api/v1/outfits/saved/:savedOutfitId/restore`
- Path Variable: `savedOutfitId` - 양의 정수
- Query String: 없음
- Request Body: 없음

### Response Body

```json
{
  "isSuccess": true,
  "code": "COMMON200",
  "message": "Saved outfit was restored.",
  "result": {
    "savedOutfitId": 14,
    "deletedAt": null,
    "restoredAt": "2026-07-31T14:10:00.000Z"
  }
}
```

### Error

- `400 REQUEST400`: ID 형식 오류
- `401 AUTH401_01`: 인증 실패
- `404 NOT_FOUND404`: 삭제 코디가 없거나 소유자가 아니거나 이미 복구됨

## SAVED-08 - 최근 삭제 코디 영구 삭제

- Method: `DELETE`
- Path: `/api/v1/outfits/saved/:savedOutfitId/permanent`
- Path Variable: `savedOutfitId` - 양의 정수
- Query String: 없음
- Request Body: 없음

### Response Body

```json
{
  "isSuccess": true,
  "code": "COMMON200",
  "message": "Saved outfit was permanently deleted.",
  "result": null
}
```

### Error

- `400 REQUEST400`: ID 형식 오류
- `401 AUTH401_01`: 인증 실패
- `404 NOT_FOUND404`: 삭제 코디가 없거나 소유자가 아니거나 먼저 soft delete되지 않음
