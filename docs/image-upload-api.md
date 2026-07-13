# BE2 Image/Upload API 명세

## IMAGE-01 이미지 업로드

| 항목 | 값 |
| --- | --- |
| HTTP 메서드 | `POST` |
| API 경로 | `/api/v1/images/upload` |
| Content-Type | `multipart/form-data` |
| 파트 | BE2 |
| 개발현황 | 개발중 |

### Header

```text
M2 스켈레톤: 없음
M3 Auth 통합 후: Authorization: Bearer <JWT_TOKEN>
```

현재 라우트에는 인증 미들웨어가 없습니다. Auth API가 통합되기 전까지 개발 환경의 업로드 계약 검증에만 사용합니다.

### Request

| 필드 | 형식 | 필수 | 설명 |
| --- | --- | --- | --- |
| `image` | binary | Y | JPG, PNG, WEBP, HEIC, HEIF 형식의 10MB 이하 이미지 |
| `imageType` | string | Y | `PROFILE`, `BODY_PROFILE`, `CLOSET_ITEM` 중 하나 |

### Response

```json
{
  "isSuccess": true,
  "code": "COMMON200",
  "message": "이미지 업로드 요청을 정상적으로 수신했습니다.",
  "result": {
    "imageId": 1720870000001,
    "imageType": "BODY_PROFILE",
    "originalName": "body.png",
    "mimeType": "image/png",
    "sizeBytes": 184302,
    "imageUrl": null,
    "uploadStatus": "RECEIVED"
  }
}
```

M3 완료 후 `imageId`는 User/Profile API의 `profileImageId` 또는 체형·옷장 이미지 참조값으로 사용합니다. 현재 M2 스켈레톤의 ID는 프로세스 내부 임시값이며 재시작 후 유지되지 않습니다. `imageUrl`과 함께 `image_assets` DB 및 실제 저장소 결과로 교체해야 합니다.

### Error

```json
{
  "isSuccess": false,
  "code": "IMAGE4001",
  "message": "업로드할 이미지가 필요합니다.",
  "result": null
}
```

### 예외처리

- 이미지 누락 시: `400 / IMAGE4001`
- `imageType` 누락 또는 허용되지 않은 값이면: `400 / IMAGE4002`
- multipart 요청 형식이 잘못됐으면: `400 / IMAGE4003`
- 이미지가 10MB를 초과하면: `413 / IMAGE4131`
- 지원하지 않는 MIME 형식이면: `415 / IMAGE4151`
