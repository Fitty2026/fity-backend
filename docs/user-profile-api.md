# BE1 사용자·온보딩 API

모든 API는 `Authorization: Bearer <accessToken>` 인증이 필요하며, 요청 본문의 `userId`는 사용자 식별에 사용하지 않습니다.

## USER-01: 약관 동의 저장

`POST /api/v1/users/agreements`

```json
{
  "agreements": [
    { "target": "TERMS_OF_SERVICE", "isAgreed": true },
    { "target": "PRIVACY_POLICY", "isAgreed": true },
    { "target": "AI_USAGE", "isAgreed": false },
    { "target": "MARKETING", "isAgreed": false }
  ]
}
```

- `target`은 `TERMS_OF_SERVICE`, `PRIVACY_POLICY`, `AI_USAGE`, `MARKETING` 중 하나이며 중복될 수 없습니다.
- `TERMS_OF_SERVICE`, `PRIVACY_POLICY`는 필수 동의 항목이며 `isAgreed: true`가 아니면 `AGREEMENT4003`으로 거부합니다.
- `AI_USAGE`, `MARKETING`은 선택 항목으로 `isAgreed: false`도 허용합니다. (`AI_USAGE`는 프론트 온보딩 화면에 이미 존재하던 항목을 임시로 계약에 포함시킨 것 — 후속 이슈에서 정식 정책 재검토 필요)
- 각 항목은 `consent_logs`에 사용자 ID·target·동의 여부의 이력으로 저장됩니다.
- 성공 응답은 `result: null`입니다.

## 스타일 태그 기준

`GET /api/v1/style-tags`

프론트엔드는 화면 배열의 위치를 ID로 추정하지 않고 이 고정 계약을 사용합니다.

| `styleTagId` | `code` | 표시명 |
| ---: | --- | --- |
| 1 | `FORMAL` | 포멀 |
| 2 | `FEMININE` | 페미닌 |
| 3 | `MINIMAL` | 미니멀 |
| 4 | `CASUAL` | 캐주얼 |
| 5 | `VINTAGE` | 빈티지 |
| 6 | `STREET` | 스트리트 |

성공 응답의 `result`는 위 순서의 `{ styleTagId, code, name, displayOrder }` 배열입니다. `displayOrder`는 표의 순서와 동일합니다.

## USER-03: 온보딩 스타일 취향 저장

`POST /api/v1/users/onboarding/style`

```json
{
  "styleTagIds": [1, 3, 5]
}
```

- 하나 이상의 ID를 전달해야 합니다.
- ID는 `GET /api/v1/style-tags`가 반환한 `styleTagId` 값만 사용할 수 있습니다.
- 요청이 성공한 즉시 인증 사용자의 스타일 취향이 DB에 반영됩니다.
- 프론트엔드는 스타일 선택 화면의 `다음` 버튼에서 이 API를 호출하고, 성공 응답을 받은 뒤 다음 화면으로 이동합니다.
- 이 API는 취향만 저장하며 온보딩 전체 완료 상태를 변경하지 않습니다. 완료 상태는 마지막 단계의 별도 API 계약으로 관리합니다.
- 성공 응답은 `result: null`입니다.

에러 코드는 실패 원인별로 구분합니다.

| 케이스 | 코드 |
| --- | --- |
| 바디/필드 누락 (`styleTagIds` 외 다른 키가 있거나 없음) | `STYLE400_01` |
| 빈 배열, 6개 초과, 중복, 양의 정수가 아닌 값 | `STYLE400_02` |
| 존재하지 않거나 비활성화된 ID | `STYLE400_03` |

선택 결과는 `user_style_preferences`에 사용자 ID와 스타일 태그 ID의 관계로 저장합니다.

## 내 프로필의 스타일 취향 조회

`GET /api/v1/users/me`

사용자 기본 정보와 함께 `styleTagIds`와 `styles`를 반환합니다. 따라서 앱 재실행이나 재로그인 이후에도 서버에 저장된 선택을 복원할 수 있습니다.

## PROFILE-01: 온보딩 체형 타입 저장

`POST /api/v1/body-profiles/type`

```json
{
  "bodyBalance": "BALANCED",
  "shoulderWidth": "AVERAGE",
  "frameSize": "MEDIUM"
}
```

- 세 필드를 모두 전달해야 하며, 각 값은 아래 enum 중 하나여야 합니다.

| 필드 | 값 |
| --- | --- |
| `bodyBalance` | `UPPER_BODY_DEVELOPED`, `BALANCED`, `LOWER_BODY_DEVELOPED` |
| `shoulderWidth` | `NARROW`, `AVERAGE`, `WIDE` |
| `frameSize` | `SMALL`, `MEDIUM`, `LARGE` |

- 이미 저장된 체형 프로필이 있으면 값을 덮어씁니다(upsert).

성공 응답 예시:

```json
{
  "isSuccess": true,
  "code": "COMMON200",
  "message": "체형 타입을 저장했습니다.",
  "result": {
    "id": 3,
    "bodyBalance": "BALANCED",
    "shoulderWidth": "AVERAGE",
    "frameSize": "MEDIUM",
    "createdAt": "2026-07-31T00:00:00.000Z",
    "updatedAt": "2026-07-31T00:00:00.000Z"
  }
}
```

## PROFILE-04: 체형 프로필 조회

`GET /api/v1/body-profiles/me`

저장된 체형 프로필이 없으면 `PROFILE4041`을 반환합니다.

## PROFILE-02: 체형 사진 분석 (MVP 스텁)

`POST /api/v1/body-profiles/analyze`

```json
{
  "imageId": 12
}
```

- `imageId`는 이미지 업로드 API(BE2)로 먼저 등록한, 소유자가 본인이고 `imageType`이 `BODY_PROFILE`이며 상태가 `ACTIVE`인 이미지여야 합니다. 아니면 `PROFILE4042`.
- **이번 구현은 실제 AI 분석이 아닌 MVP 스텁입니다.** `imageId`로부터 결정론적으로 `bodyBalance`/`shoulderWidth`/`frameSize`를 산출해 `body_profiles`에 upsert합니다. 응답의 `provider: "stub"` 필드로 스텁 결과임을 구분합니다.
- 성공 응답은 PROFILE-01과 동일한 필드에 `provider: "stub"`이 추가됩니다.
- 실제 외부 AI 분석 연동(체형 분류, 랜드마크, 이미지 품질 검사 등 `erd/body_profile_data.schema.json` 전체 스키마 반영)은 [이슈 #29](https://github.com/Fitty2026/fity-backend/issues/29)에서 관리합니다.
