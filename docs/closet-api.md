# BE3 옷장 API 명세

## 공통 인증·소유권 규칙

- 모든 옷장 API는 `Authorization: Bearer <accessToken>` 인증이 필요합니다.
- 사용자 식별은 공통 JWT 미들웨어가 설정한 `req.auth.userId`만 사용합니다.
- body, query, header의 `userId`는 인증·소유권 판단에 사용하지 않습니다.
- 다른 사용자의 아이템과 존재하지 않는 아이템은 모두 `404 / CLOSET4041`로 응답합니다.
- 옷장 이미지에는 인증 사용자가 소유한 `ACTIVE` 상태의 `CLOSET_ITEM` 이미지만 사용할 수 있습니다.

## CLOSET-01 쇼핑몰 연동 요청 기록

`POST /api/v1/closets/sync`

```json
{
  "platform": "MUSINSA",
  "is_agreed": true
}
```

| 필드 | 형식 | 필수 | 설명 |
| --- | --- | --- | --- |
| `platform` | string | Y | 비어 있지 않은 쇼핑몰 식별명 |
| `is_agreed` | boolean | Y | 반드시 `true` |

성공 응답 예시:

```json
{
  "isSuccess": true,
  "code": "COMMON200",
  "message": "쇼핑몰 연동 요청을 저장했습니다.",
  "result": {
    "sync_id": 3,
    "platform": "MUSINSA",
    "status": "REQUESTED",
    "consent_id": 5
  }
}
```

이 API는 동의 로그와 `REQUESTED` 상태의 가져오기 세션을 DB에 기록합니다. 실제 쇼핑몰 OAuth, 구매내역 조회, 자동 옷장 가져오기는 수행하지 않습니다.

## CLOSET-02 옷장 아이템 등록

`POST /api/v1/closets/items`

```json
{
  "imageId": 12,
  "name": "흰색 셔츠",
  "size": "M",
  "category": "TOP",
  "importType": "MANUAL",
  "tags": ["여름", "흰색"]
}
```

| 필드 | 형식 | 필수 | 설명 |
| --- | --- | --- | --- |
| `imageId` | positive integer | Y | 인증 사용자 소유의 `ACTIVE` `CLOSET_ITEM` 이미지 ID |
| `name` | string | Y | 비어 있지 않은 아이템명 |
| `size` | string | Y | 비어 있지 않은 사이즈 |
| `category` | string | Y | 비어 있지 않은 카테고리 |
| `importType` | string | Y | 비어 있지 않은 등록 방식 |
| `tags` | string[] | Y | 한 개 이상이며 중복과 빈 문자열이 없는 태그 배열 |

성공 시 `201 / COMMON201`을 반환합니다.

```json
{
  "isSuccess": true,
  "code": "COMMON201",
  "message": "옷장 아이템 등록에 성공했습니다.",
  "result": {
    "item_id": 21,
    "name": "흰색 셔츠",
    "size": "M",
    "category": "TOP",
    "import_type": "MANUAL",
    "tags": ["여름", "흰색"],
    "image_url": "/api/v1/images/12/content",
    "created_at": "2026-07-26T09:00:00.000Z",
    "updated_at": "2026-07-26T09:00:00.000Z"
  }
}
```

## CLOSET-03 옷장 아이템 목록 조회

`GET /api/v1/closets/items`

선택 query:

| 필드 | 형식 | 설명 |
| --- | --- | --- |
| `category` | string | 카테고리 완전 일치 필터 |
| `keyword` | string | 아이템명 부분 일치 검색 |

인증 사용자 소유 아이템을 최신 등록순 배열로 반환합니다. 페이지네이션은 현재 제공하지 않습니다.

## CLOSET-04 옷장 아이템 상세 조회

`GET /api/v1/closets/items/:itemId`

인증 사용자 소유 아이템 하나를 CLOSET-02의 `result`와 같은 형식으로 반환합니다. `itemId`는 양의 정수여야 합니다.

## CLOSET-05 옷장 아이템 수정

`PATCH /api/v1/closets/items/:itemId`

```json
{
  "name": "오프화이트 셔츠",
  "tags": ["가을", "오프화이트"]
}
```

- 수정 가능 필드는 `name`, `size`, `category`, `importType`, `tags`입니다.
- 하나 이상의 수정 가능 필드를 전달해야 합니다.
- `tags`를 전달하면 기존 태그 전체를 새 배열로 교체합니다.
- `imageId`는 이 API에서 변경할 수 없습니다.
- 수정 성공 시 변경된 아이템을 CLOSET-02의 `result`와 같은 형식으로 반환합니다.

## CLOSET-06 옷장 아이템 삭제

`DELETE /api/v1/closets/items/:itemId`

소유권을 확인한 뒤 아이템과 연결 태그를 삭제합니다. 성공 응답의 `result`는 `null`입니다. 연결된 BE2 이미지 자산은 이 API에서 삭제하지 않습니다.

## 상태와 오류 코드

| HTTP | 코드 | 의미 |
| --- | --- | --- |
| 400 | `CLOSET4001` | 필수 문자열 누락 또는 빈 문자열 |
| 400 | `CLOSET4002` | tags 형식 오류, 빈 태그 또는 중복 태그 |
| 400 | `CLOSET4003` | 구매내역 조회 권한 미동의 |
| 400 | `CLOSET4004` | 잘못된 imageId |
| 400 | `CLOSET4005` | 수정할 수 있는 필드 없음 |
| 400 | `CLOSET4006` | 잘못된 itemId |
| 401 | `AUTH4011` | 인증 실패 |
| 404 | `IMAGE4041` | 사용할 수 있는 소유 의류 이미지 없음 |
| 404 | `CLOSET4041` | 소유 아이템이 아니거나 존재하지 않음 |

## 배포 전 조건

- 운영 MySQL/MariaDB에 옷장 관련 마이그레이션을 적용하고 실제 트랜잭션 동작을 확인해야 합니다.
- `category`, `size`, `importType`, `platform`의 팀 공통 enum 또는 허용값 계약은 현재 서비스에서 강제하지 않으므로 프론트엔드와 확정해야 합니다.
- 쇼핑몰 구매내역 연동은 공식 API·제휴·OAuth 권한이 확보된 뒤 별도 구현해야 합니다.
- 이미지 삭제와 옷장 아이템 참조 해제 순서는 운영 정책으로 확정해야 합니다.
