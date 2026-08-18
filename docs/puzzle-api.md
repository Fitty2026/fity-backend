# BE4 Puzzle API

## 잔량 조회

`GET /api/v1/puzzles/balance`

인증된 사용자의 퍼즐 잔량을 조회합니다. 신규 가입자는 최초 1회 `100` 퍼즐을 지급받습니다.

```http
Authorization: Bearer <JWT_TOKEN>
```

```json
{
  "isSuccess": true,
  "code": "COMMON200",
  "message": "요청에 성공했습니다.",
  "result": {
    "balance": 100,
    "currency": "PUZZLE"
  }
}
```

지급과 차감은 공개 API로 제공하지 않습니다. MVP에서는 코디 생성 요청을 서버가 접수해 새 job을 만들 때만 퍼즐을 차감합니다. 충전 및 거래내역 API는 MVP 범위에서 제외합니다.

최초 지급량은 `100` 퍼즐이며 `INITIAL_PUZZLE_BALANCE` 환경변수로 설정합니다. 사용자 생성, 지갑 생성 및 최초 지급 원장은 하나의 serializable DB transaction으로 처리합니다.

코디 생성 비용의 기본값은 `10` 퍼즐이며 `OUTFIT_GENERATION_PUZZLE_COST` 환경변수로 설정합니다. 기존 진행 job 반환 및 동일 요청 재시도에는 중복 차감하지 않습니다. 잔액이 부족하면 `PUZZLE409_01`을 반환하며 job 생성도 함께 취소됩니다.

모든 지급·차감은 사용자별 지갑과 거래 원장을 같은 serializable DB transaction에서 갱신하며, 사용자별 `idempotencyKey`로 중복 반영을 막습니다. 동시에 같은 요청이 들어와도 기존 거래를 반환하고, 일시적인 DB 쓰기 충돌은 제한적으로 재시도합니다.

같은 `idempotencyKey`를 사용할 때는 거래 유형, 금액, 사유, `referenceType`, `referenceId`가 모두 같아야 합니다. 하나라도 다르면 다른 거래로 판단합니다.

## 오류 코드

| HTTP | code | 의미 |
| --- | --- | --- |
| 401 | `AUTH401_01` | 인증 실패 |
| 409 | `PUZZLE409_01` | 퍼즐 잔액 부족 |
| 409 | `PUZZLE409_02` | 멱등키를 다른 거래에 재사용 |

현재 MVP 차감 시점은 신규 코디 생성 job 접수 시점입니다. 충전, 거래내역 조회 및 실패 이후 환불 기능은 MVP 범위에서 제외합니다.
