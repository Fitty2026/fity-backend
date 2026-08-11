# BE4 Puzzle API

## 잔량 조회

`GET /api/v1/puzzles/balance`

인증된 사용자의 퍼즐 잔량을 조회합니다. 지갑이 아직 생성되지 않은 사용자는 `0`을 반환합니다.

```http
Authorization: Bearer <JWT_TOKEN>
```

```json
{
  "isSuccess": true,
  "code": "COMMON200",
  "message": "요청에 성공했습니다.",
  "result": {
    "balance": 0,
    "currency": "PUZZLE"
  }
}
```

지급과 차감은 공개 API로 제공하지 않습니다. 회원가입, 출석, 공유, 코디 생성처럼 서버가 검증한 이벤트에서만 `PuzzleService.credit` 또는 `PuzzleService.debit`를 호출해야 합니다.

모든 지급·차감은 사용자별 지갑과 거래 원장을 같은 DB transaction에서 갱신하며, 사용자별 `idempotencyKey`로 중복 반영을 막습니다.

## 오류 코드

| HTTP | code | 의미 |
| --- | --- | --- |
| 401 | `AUTH401_01` | 인증 실패 |
| 409 | `PUZZLE409_01` | 퍼즐 잔액 부족 |
| 409 | `PUZZLE409_02` | 멱등키를 다른 거래에 재사용 |

## 미확정 정책

초기 지급량, 보상별 지급량, 코디 생성 1회 차감량, 실패 시 환불 정책은 확정 후 코디 생성 transaction에 연결합니다. 확정 전에는 임의의 금액을 적용하지 않습니다.
