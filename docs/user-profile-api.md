# BE1 사용자·온보딩 API

모든 API는 `Authorization: Bearer <accessToken>` 인증이 필요하며, 요청 본문의 `userId`는 사용자 식별에 사용하지 않습니다.

## 스타일 태그 기준

`GET /api/v1/style-tags`

프론트엔드는 화면 배열의 위치를 ID로 추정하지 않고 이 고정 계약을 사용합니다.

| `id` | `code` | 표시명 |
| ---: | --- | --- |
| 1 | `FORMAL` | 포멀 |
| 2 | `FEMININE` | 페미닌 |
| 3 | `MINIMAL` | 미니멀 |
| 4 | `CASUAL` | 캐주얼 |
| 5 | `VINTAGE` | 빈티지 |
| 6 | `STREET` | 스트리트 |

성공 응답의 `result`는 위 순서의 `{ id, code, name, displayOrder }` 배열입니다. `displayOrder`는 표의 순서와 동일합니다.

## USER-01: 온보딩 스타일 취향 저장

`POST /api/v1/users/onboarding/style`

```json
{
  "styleTagIds": [1, 3, 5]
}
```

- 하나 이상의 ID를 전달해야 합니다.
- ID는 `GET /api/v1/style-tags`가 반환한 값만 사용할 수 있습니다.
- 중복 ID와 알 수 없는 ID는 `USER4003`으로 거부합니다.
- 요청이 성공한 즉시 인증 사용자의 스타일 취향이 DB에 반영됩니다.
- 프론트엔드는 스타일 선택 화면의 `다음` 버튼에서 이 API를 호출하고, 성공 응답을 받은 뒤 다음 화면으로 이동합니다.
- 이 API는 취향만 저장하며 온보딩 전체 완료 상태를 변경하지 않습니다. 완료 상태는 마지막 단계의 별도 API 계약으로 관리합니다.

성공 응답 예시:

```json
{
  "isSuccess": true,
  "code": "COMMON200",
  "message": "온보딩 스타일을 저장했습니다.",
  "result": {
    "userId": 7,
    "styleTagIds": [1, 3, 5],
    "styles": [
      { "id": 1, "code": "FORMAL", "name": "포멀", "displayOrder": 1 },
      { "id": 3, "code": "MINIMAL", "name": "미니멀", "displayOrder": 3 },
      { "id": 5, "code": "VINTAGE", "name": "빈티지", "displayOrder": 5 }
    ]
  }
}
```

선택 결과는 `user_style_preferences`에 사용자 ID와 스타일 태그 ID의 관계로 저장합니다. 마이그레이션은 기존 `users.style_tags` JSON에서 알려진 한글 표시명, 영문 코드, 소문자 영문 코드만 관계 테이블로 이관합니다. 알 수 없는 자유 입력 태그는 잘못된 ID로 추정하지 않습니다. 기존 JSON 컬럼은 이전 데이터 호환을 위해 당장 삭제하지 않지만, USER-01은 해당 컬럼을 읽거나 쓰지 않습니다.

## 내 프로필의 스타일 취향 조회

`GET /api/v1/users/me`

사용자 기본 정보와 함께 `styleTagIds`와 `styles`를 반환합니다. 따라서 앱 재실행이나 재로그인 이후에도 서버에 저장된 선택을 복원할 수 있습니다. 기존 `styleTags` 필드는 마이그레이션 호환을 위해 응답에 남아 있지만 신규 연동에서는 사용하지 않습니다.
