# BE2 이미지 자산 API 명세

## 공통 인증·소유권 규칙

- 모든 이미지 API는 BE1 인증 미들웨어가 설정한 `req.auth.userId`를 사용합니다.
- 인증 컨텍스트가 없으면 `401 / AUTH4011`을 반환합니다.
- body, query, header로 전달된 사용자 ID는 소유권 판단에 사용하지 않습니다.
- 다른 사용자의 이미지와 존재하지 않는 이미지는 모두 `404 / IMAGE4041`로 응답합니다.
- `storageKey`와 실제 private 저장소 경로는 응답하지 않습니다.

## IMAGE-01 이미지 업로드

| 항목 | 값 |
| --- | --- |
| HTTP 메서드 | `POST` |
| API 경로 | `/api/v1/images/upload` |
| Content-Type | `multipart/form-data` |
| 파일 제한 | 1개, 10MB 이하 |

### Request

| 필드 | 형식 | 필수 | 설명 |
| --- | --- | --- | --- |
| `image` | binary | Y | JPG, PNG, WEBP, HEIC, HEIF |
| `imageType` | string | Y | `PROFILE`, `BODY_PROFILE`, `CLOSET_ITEM` |

`OUTFIT_RESULT`는 클라이언트 업로드 값이 아닙니다. `ImageService.createGeneratedImage()` 내부 서비스로 `GENERATED` 또는 `FALLBACK` 결과를 저장할 수 있습니다. 다만 현재 BE4 코디 서비스는 이 메서드와 연결되지 않았으며 AI가 반환한 외부 URL을 직접 저장하므로, 생성 결과 파일 영속화는 후속 통합이 필요합니다.

```bash
curl -X POST 'http://localhost:3000/api/v1/images/upload' \
  -H 'Authorization: Bearer <JWT_TOKEN>' \
  -F 'imageType=BODY_PROFILE' \
  -F 'image=@./body.png;type=image/png'
```

### Success

```json
{
  "isSuccess": true,
  "code": "COMMON200",
  "message": "이미지를 저장했습니다.",
  "result": {
    "imageId": 12,
    "imageType": "BODY_PROFILE",
    "origin": "USER_UPLOAD",
    "originalName": "body.png",
    "mimeType": "image/png",
    "sizeBytes": 184302,
    "checksumSha256": "<sha256>",
    "imageUrl": "/api/v1/images/12/content",
    "uploadStatus": "ACTIVE",
    "createdAt": "2026-07-16T09:00:00.000Z"
  }
}
```

성공 응답은 파일과 `image_assets` 레코드가 모두 저장되고 상태가 `ACTIVE`가 된 뒤에만 반환됩니다.
MIME과 매직 바이트뿐 아니라 이미지 디코딩과 가로·세로 메타데이터 확인까지 통과해야 저장됩니다.

## IMAGE-02 이미지 메타데이터 조회

`GET /api/v1/images/:imageId`

인증 사용자 소유의 `ACTIVE` 이미지에 한해 IMAGE-01과 같은 메타데이터를 반환합니다.

## IMAGE-03 이미지 콘텐츠 조회

`GET /api/v1/images/:imageId/content`

- 인증 사용자 소유 이미지의 바이트를 원본 MIME 타입으로 반환합니다.
- `Cache-Control: private, no-store`를 사용합니다.
- private 저장소의 실제 URL은 노출하지 않습니다.

## IMAGE-04 이미지 삭제

`DELETE /api/v1/images/:imageId`

삭제 상태는 다음 순서로 전이합니다.

```text
ACTIVE 또는 DELETE_FAILED
  -> DELETE_PENDING
  -> 실제 파일 삭제
  -> DELETED
```

파일 삭제가 실패하면 `DELETE_FAILED`로 기록하고 즉시 조회를 차단합니다. 같은 DELETE 요청으로 재시도할 수 있습니다.

## 상태와 오류 코드

| HTTP | 코드 | 의미 |
| --- | --- | --- |
| 400 | `IMAGE4001` | 이미지 누락 |
| 400 | `IMAGE4002` | imageType 누락 또는 허용되지 않은 값 |
| 400 | `IMAGE4003` | 잘못된 multipart 요청 |
| 400 | `IMAGE4004` | 잘못된 이미지 ID |
| 401 | `AUTH4011` | 인증 사용자 컨텍스트 없음 |
| 404 | `IMAGE4041` | 소유 이미지가 아니거나 존재하지 않음 |
| 409 | `IMAGE4091` | 이미지 상태상 현재 삭제 불가 |
| 413 | `IMAGE4131` | 10MB 초과 |
| 415 | `IMAGE4151` | 지원하지 않는 형식 또는 MIME/시그니처 불일치 |
| 503 | `IMAGE5031` | 메타데이터 저장 실패 |
| 503 | `IMAGE5032` | 파일 저장 또는 상태 확정 실패 |
| 503 | `IMAGE5033` | 파일 읽기 실패 |
| 503 | `IMAGE5034` | 파일 삭제 실패 |
| 503 | `IMAGE5035` | 이미지 메타데이터 조회·상태 저장 실패 |

## 배포 전 조건

- BE1 JWT 검증 미들웨어가 `req.auth.userId: number`를 설정해야 합니다.
- 개발 기본 로컬 저장소는 단일 인스턴스용입니다. 다중 인스턴스 배포에서는 S3/R2 호환 어댑터가 필요합니다.
- 참조 중인 프로필·옷장·코디 결과의 삭제 정책은 각 도메인 API에서 참조 해제 또는 교체 후 호출하도록 확정해야 합니다.
- 서버 시작 시 15분 이상 `UPLOADING` 또는 `DELETE_PENDING`인 레코드를 정리해 중단된 상태를 복구합니다.
