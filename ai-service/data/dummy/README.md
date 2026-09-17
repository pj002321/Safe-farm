# 더미 데이터

실측 마스터(crops · crop_variants · crop_stages · grids · stations)는
`data/master/` 로 옮겼다. 이름이 거짓말을 하지 않게 하려는 것이다.

## 적재 순서

FK 때문에 순서를 지켜야 한다.

```
weather_obs_daily  부모 stations 는 data/master/ 에 있다
```

`terms`·`user_agreements` 는 어느 스크립트도 넣지 않는다 — 아래 참고.

## CSV 에 surrogate id 가 없는 이유

`crop_id` `variant_id` `grid_id` `terms_id` 는 `generated always as identity` 라
값을 직접 넣으면 Postgres 가 거부한다(`overriding system value` 를 붙여야 한다).

그래서 자식 CSV 는 id 대신 **자연키**로 부모를 가리킨다.

| 파일 | 부모를 가리키는 방법 |
|---|---|
| `crop_variants.csv` | `crop_name` |
| `crop_stages.csv` | `crop_name` + `maturity_type` |

적재하는 쪽이 부모를 먼저 넣고, 생성된 id 를 조회해서 매핑한다.

`stations.station_code` 는 자연키가 곧 PK 라 그대로 쓴다.

## profiles · user_agreements 는 더 이상 적재하지 않는다

유저가 넣는 데이터라 쓰기는 Next.js 몫이고 정본은 `supabase/migrations` 다.
ai-service 는 그 값을 요청으로 받지 DB 에서 읽지 않으므로 더미가 필요 없다.

`profiles.csv` · `user_agreements.csv` 는 아직 남아 있지만 어느 스크립트도 읽지 않는다.
`profiles.csv` 는 `nickname`·`deleted_at` 을 쓰는 옛 스키마라 지금 ORM 과도 맞지 않는다.

## 일부러 넣어둔 것

- `weather_obs_daily.csv` 의 `133 / 2026-09-12` — `rainfall_mm` 만 빈 값
- `crop_stages` 의 GDD 구간은 반개구간으로 이어진다 (`0~80`, `80~200`, ...). 경계값 80 은
  1단계가 아니라 2단계다
