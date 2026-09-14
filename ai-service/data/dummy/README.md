# 더미 데이터

전부 가짜 값이다. 실제 기상·작물 수치가 아니다.

## 적재 순서

FK 때문에 순서를 지켜야 한다.

```
terms ─┐
profiles ─┴─> user_agreements

grids ──> weather_forecast
stations ──> weather_obs_daily

crops ──> crop_variants ──> crop_stages
```

## CSV 에 surrogate id 가 없는 이유

`crop_id` `variant_id` `grid_id` `terms_id` 는 `generated always as identity` 라
값을 직접 넣으면 Postgres 가 거부한다(`overriding system value` 를 붙여야 한다).

그래서 자식 CSV 는 id 대신 **자연키**로 부모를 가리킨다.

| 파일 | 부모를 가리키는 방법 |
|---|---|
| `crop_variants.csv` | `crop_name` |
| `crop_stages.csv` | `crop_name` + `maturity_type` |
| `weather_forecast.csv` | `nx` + `ny` |
| `user_agreements.csv` | `user_id` + `terms_type` + `terms_version` |

적재하는 쪽이 부모를 먼저 넣고, 생성된 id 를 조회해서 매핑한다.

`stations.station_code` 는 자연키가 곧 PK 라 그대로 쓴다.

## profiles 는 개발 DB 전용

`profiles.csv` 의 uuid 는 지어낸 값이라 `auth.users` 에 없다.

DB 에 아직 `auth.users(id)` FK 가 없어서 지금은 그냥 들어간다. 나중에 auth 를 붙이며
제약을 거는 마이그레이션이 이 행들 때문에 실패하므로, 그 전에 지운다.
운영 DB 에는 넣지 않는다.

## 일부러 넣어둔 것

- `weather_forecast.csv` 의 `52,38 / 2026-09-15` — 기온·강수가 전부 빈 값. 해상 결측 재현
- `weather_obs_daily.csv` 의 `133 / 2026-09-12` — `rainfall_mm` 만 빈 값
- `profiles.csv` 의 `탈퇴한사용자` — `deleted_at` 이 채워진 행. 조회 시 걸러지는지 확인용
- `user_agreements.csv` 의 `MARKETING` — `withdrawn_at` 이 채워진 철회 행
- `terms.csv` 의 `TERMS v1.1` — 개정이 UPDATE 가 아니라 INSERT 인 것을 보여주는 행
- `crop_stages` 의 GDD 구간은 반개구간으로 이어진다 (`0~80`, `80~200`, ...). 경계값 80 은
  1단계가 아니라 2단계다
