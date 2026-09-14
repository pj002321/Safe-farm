# DATA_SCHEMA — 세이프팜 데이터 구성

> `FEATURE_SPEC.md` 가 정의한 기능이 실제로 쓰는 저장소·테이블·컬럼을 정리한다.
> 이름은 전부 `DOMAIN_REF.md` §6(각 출처 문서의 "우리 스키마 매핑")과 기존 코드의
> 타입명을 그대로 따른다 — 여기서 새 이름을 짓지 않는다.

**상태 표기**는 `FEATURE_SPEC.md` 와 동일(구현/설계/미착수).

---

## 1. 저장소 두 곳

AGENTS.md 의 원칙: Firebase SDK 2종을 섞지 않는다. 데이터도 같은 이유로 성격이 다른
두 저장소로 나뉜다.

| | Firestore | Postgres (`ai-service`) |
|---|---|---|
| 담는 것 | 사용자가 소유한 문서 (프로필·텃밭·재배 이력) | 시계열·참조 데이터 (기상·위성·특보·RAG 청크) |
| 접근 경로 | 브라우저 SDK(읽기 일부) + Admin SDK(서버) | `ai-service` 코드만 (SQLAlchemy) |
| 권한 경계 | `firestore.rules` | 코드가 직접 검사 (규칙 없음 — DOMAIN_REF §5 "authKey 노출" 같은 급의 책임) |
| 갱신 방식 | 사용자 조작 시 | 매일 배치 / 5일 위성 주기 / 연 1회 |

**Admin SDK 로 Postgres 를 만지지 않는다.** 반대로 `ai-service` 도 Firestore 사용자
문서를 직접 만지지 않는다 — 텃밭 좌표가 필요하면 Next.js 서버가 조회해 넘긴다.
이 경계가 없으면 "누가 어느 DB 의 정본(source of truth)인가"가 흐려진다.

---

## 2. Firestore 컬렉션

### `profiles/{uid}` — 구현됨

`firestore.rules` 에 이미 규칙이 있다. 본인만 read, 고칠 수 있는 필드는
`fullName`·`avatarUrl`·`marketingOptIn` 뿐(위조 방지, 규칙 주석 참고).

### `plots/{plotId}` — 설계만

F1(텃밭 등록)의 산출물. DOMAIN_REF §2 "텃밭 등록 시 한 번에 해둘 것"의 결과를
그대로 담는다.

```
ownerUid       string   profiles/{uid} 참조. 본인 텃밭만 read 가능해야 함
nameKo         string
kind           "paddy" | "field" | "orchard"   (PlotKind, observation.ts 와 동일 값)
lat, lon       number   사용자가 찍은 원좌표
elevationM     number   Open-Meteo 응답의 elevation (요청 좌표와 스냅 좌표가 달라
                        생기는 오차 있음 — DOMAIN_REF Open-Meteo §4)
station        string   최근접 기상청 관측소 stn (예: "137")
nx, ny         number   예보격자 (nph-dfs_xy_lonlat 결과)
warnRegion     string   특보구역 REG_ID (예: "L1071200")
createdAt      timestamp
```

**⚠ `firestore.rules` 에 이 컬렉션의 규칙이 아직 없다.** 지금 배포된 규칙은
`profiles` 하나뿐이라 catch-all(`allow read, write: if false`)에 걸려 전부 거부된다
— 컬렉션을 만들면 스키마와 규칙을 **같은 커밋**으로 추가한다(AGENTS.md 원칙). 최소
"본인 uid == ownerUid 인 문서만 read, 쓰기는 서버(Admin SDK)만" 정도가 될 것이다.

### `cultivations/{id}` — 설계만

F2 의 `daysSincePlanting` 계산 근거. 한 텃밭에서 작물 하나를 심고 거두는 한 주기.

```
plotId         string   plots 참조
cropId         string   growthStage.ts 의 CROP_CALENDARS 키와 반드시 일치
plantedDate    date
harvestedAt    date | null
status         "growing" | "harvested" | "failed"
failureReason  string | null   (F2 부록: 실패 사유 체크 — 병해충/냉해·서리/가뭄/과습/관리부족)
```

### `growthNotes/{id}` — 설계만

`safefarm_답변.md` §4 "1차부터 라벨이 모이게 설계합니다"의 생육일기.

```
cultivationId  string
date           date
checks         string[]   물 줌 / 거름 줌 / 약 침 / 김맴 / 벌레 봄 / 잎이 이상함 / 별일 없음
photoUrl       string | null   (Storage 경로)
```

지금 당장 F2/F5 어디에도 쓰이지 않는다. F9 나 향후 머신러닝(병해충 판별·수확량
예측)의 라벨용 — `safefarm_답변.md` §4 부록 참고.

---

## 3. Postgres — 기상·위성 (전부 설계만)

DOMAIN_REF 세 문서의 §6 "우리 스키마 매핑"을 합친 것이다. 열 이름은 그 표에서
그대로 가져왔다.

### `weather_daily`

```
plot_id       FK → plots
date          date
kind          "obs" | "fcst"     같은 (plot_id, date) 로 append, 나중에 온 obs 가
                                  fcst 를 덮어씀 (Open-Meteo §6 그대로)
tmax, tmin, tmean   ℃
rain          mm
wind_max      m/s
sunrise, sunset     time (Open-Meteo 전용 — 기상청엔 없음)
humidity_mean, radiation_sum, et0   Open-Meteo 전용 (2차)
lst_min       ℃   천리안 지표면온도 (2차, 기상청 전용)
source        "kma" | "open-meteo"
```

**PK 후보** `(plot_id, date, source)`. `kind` 로 obs/fcst 를 구분하되 동일
`(plot_id, date)` 에 obs 가 들어오면 fcst 행을 덮어쓰는 upsert 로직이 필요하다
(단순 append 가 아님 — Open-Meteo §6 원문은 "append 하면 덮어쓴다"고 되어 있으나
실제로는 조회 시 `kind='obs'` 우선으로 걸러야 함, 또는 upsert 로 물리적으로 덮어씀).

### `normals` — F6 전용

```
station or plot_id
month, day (또는 순/월 단위)
tmax_normal, tmin_normal, rain_normal   1991~2020 평년값
source        "kma" | "open-meteo-era5"
```

기상청 `arcltr_sfc_norm`(공식)과 Open-Meteo archive 30년(자체 계산) 두 출처를 같은
테이블에 `source` 로 구분해 대조 가능하게 한다(DOMAIN_REF 기상청 §6 "미호출. 1순위
작업").

### `disaster_rules` — F4 절기재해 기준값

```
risk          "01".."05"   저온/고온/일소/바람/홍수가뭄
solar_term    "01".."24"   24절기
crop_id       nullable — 작물 무관 기준이면 null
ta_min        ℃    참고용 (일반 기온)
tg_min        ℃    초상온도 — 서리 판정의 핵심값 (risk=01 전용)
sample_years  int   몇 년치로 평균 냈는지
```

DOMAIN_REF §3 예시처럼 "24절기 × 5개 재해 = 120개 조합"을 이 테이블에 미리 채워
두면 조회 시 API 호출 없이 기준값을 바로 쓸 수 있다. **risk=02~05 는 응답 필드
자체가 미확인**이므로 이 스키마는 risk=01 필드만 검증됨 — 나머지는 실제 호출 후
컬럼이 늘어날 수 있다.

### `soil_daily` — 2차

```
plot_id, date, depth ("0.1m" | "0.4m" | "1m" | "2m")
soil_temp     ℃
soil_moisture m³/m³ (단위 미확인 — DOMAIN_REF Open-Meteo §9 TODO)
source        "kma-nwp" | "open-meteo"
```

### `official_alerts` — F4 특보

```
reg_id, reg_ko, wrn, lvl, tm_fc, tm_ef, cmd
raw           jsonb (원본 응답 보관 — CMD 해제/연장 추적용)
```

조회할 때 `warn_regions` 로 상위 구역까지 전부 확인해야 한다(DOMAIN_REF §4-5
`my_regions` 함수 그대로 이식 — TS 로 옮길 위치는 `features/monitoring/domain`).

### `warn_regions`, `stations` — 정적 참조

이미 `ai-service/data/warn_regions.csv`(414행), `data/stations.csv` 로 존재.
최초 1회 적재 후 텃밭 위치가 바뀌지 않는 한 갱신 불필요.

### `satellite_obs` — F5

```
plot_id, date
ndvi, ndwi, ndmi   float
valid_pct          float   (70% 미만이면 조회 자체를 안 함 — DOMAIN_REF Sentinel §2)
is_valid           bool    (70% 넘어도 이상치면 false — 앞뒤 대비 급락 규칙 미확정)
source             "sentinel2" | "cas500-1" | "gk2a"
```

`observation.ts` 의 `ObservationPoint` 는 현재 `ndvi`·`ndmi` 만 있고 `ndwi` 가
없다 — 이 테이블을 실제로 채우게 되면 타입도 같이 넓혀야 한다.

### `advices` — F2/F3/F7 결과 저장

`safefarm_답변.md` §3 스키마 그대로.

```
cultivation_id, advice_date, summary, todos (text[]), warnings (text[]),
input_snapshot (jsonb)   -- 조언을 만들 때 쓴 입력값 전체. 근거 추적용
```

---

## 4. Postgres — RAG (F9, 전부 미착수)

```
documents   id, title, content, source, created_at
chunks      id, document_id FK, content, embedding (vector(1536)), created_at
```

`app/core/config.py` 의 `DIMENSION = 1536`(`text-embedding-3-small`)과 일치시켜야
한다. **`pgvector` 확장·같은 이름 파이썬 패키지가 `requirements.txt` 에 없다** —
`Chunk.embedding.cosine_distance(...)` 를 쓰려면 SQLAlchemy 컬럼 타입 자체가
`pgvector.sqlalchemy.Vector` 여야 하는데 지금은 그 의존성이 없다. F9 를 시작하기
전에 먼저 채워야 할 구멍.

---

## 5. 도메인 타입 ↔ DB 컬럼 매핑

기존 TS 도메인 타입은 전부 순수 입력 타입이라 DB 컬럼명과 1:1 이 아니다. 조회 계층
(아직 없음)이 이 매핑을 책임진다.

| 도메인 타입 (파일) | 필드 | DB 출처 |
|---|---|---|
| `WeatherWindow` (`recommendation/domain/suitability.ts`) | `avgTempC` | `weather_daily.tmean` 구간 평균 |
| | `rainfallMm` | `weather_daily.rain` 구간 합 |
| | `sunshineHours` | 미해결 (FEATURE_SPEC F2 참고) |
| `GrowthObservation` (`growth/domain/growthNotes.ts`) | `recentAvgTempC` 등 | 위와 동일, 최근 7일 창 |
| | `forecastMinTempC` 등 | `weather_daily` `kind='fcst'` |
| `ObservationSeries`/`ObservationPoint` (`monitoring/domain/observation.ts`) | `ndvi`, `ndmi` | `satellite_obs` (`is_valid=true` 만) |
| `PlotProfile` (`monitoring/domain/plots.ts`) | 전체 | **주의: 이건 랜딩 데모 상수다.** 실제 `plots` 테이블과 이름은 비슷하지만 다른 것 — 혼동 금지 |
| `HazardKind` (`monitoring/domain/hazards.ts`) | `frost`/`heat`/`drought`/`flood`/`wind` | `official_alerts.wrn`, `disaster_rules.risk` (매핑표는 FEATURE_SPEC F4) |
| `CropCalendar` (`growth/domain/growthStage.ts`) vs `CropProfile` (`recommendation/domain/suitability.ts`) | 둘 다 "작물 기준값"이지만 필드 형태가 다르다(`idealTempC` vs `tempRangeC` 등) | **DB 는 아직 없음.** 하나의 `crops` 참조 테이블로 합칠지, 두 개로 유지할지 결정 필요 — 지금은 코드에 상수로만 존재 |

---

## 6. 미해결 · 우선순위

```
[ ] plots / cultivations 컬렉션 스키마 확정 + firestore.rules 동시 작성
[ ] weather_daily upsert 정책 (obs 가 fcst 를 덮는 구체적 SQL/쿼리)
[ ] sunshineHours 를 어느 Open-Meteo·기상청 변수로 근사할지 결정
[ ] disaster_rules risk=02~05 응답 필드 확인 (DOMAIN_REF 남은 숙제)
[ ] pgvector 패키지 추가 + Document/Chunk SQLAlchemy 모델 작성 (F9 선행 조건)
[ ] CropCalendar / CropProfile 통합 여부 결정
[ ] HazardKind 에 대설(S) 추가 여부, 우박(hail) 데이터 출처 확보 여부
[ ] SH_CLIENT_ID/SECRET invalid_client — Sentinel Hub 대시보드에서 값 재확인·재발급 (§7 참고)
```

---

## 7. 실측 검증 로그 (2026-09-14)

`ai-service/.env`에 4개 키를 채운 뒤 실제 호출로 확인했다. 코드가 아니라 curl 로 직접
찍은 결과이므로, 파이프라인이 배선되면 이 형태 그대로 나와야 한다.

### 키 상태

| 키 | 상태 | 확인 방법 |
|---|---|---|
| `KMA_API_KEY` | **정상** | 일통계·평년값·절기재해·특보현황·격자변환 5종 호출 성공 |
| `KAKAO_MAP_API_KEY` | **정상** | 주소 검색, 좌표→행정구역 역지오코딩 성공 |
| `SH_CLIENT_ID` / `SH_CLIENT_SECRET` | **실패** (`invalid_client`) | OAuth 토큰 발급 자체가 거부됨 — 대시보드에서 값 재확인 필요. 위성(F5) 실데이터 연동은 이 키가 고쳐지기 전까지 불가 |
| `OPENAI_API_KEY` / `ANTROPIC_API_KEY` | 미검증 | 값은 채워짐. 호출 테스트 안 함 |

### 확인된 실제값 — 상주(`stn=137`, `lat=36.4084`, `lon=128.1574`)

```
KMA 일통계 9/5~9/14      최고 25.5~29.1℃ · 최저 12.1~17.3℃
                         9/14(당일)는 TA_DAY·WS_DAY가 -999 — "당일은 집계 중" 규칙 실측 재현
KMA 평년값 9월 상순       평균기온 20.8~22.4℃로 완만히 하강
KMA 절기재해 risk=01(백로) 5개년   TG_MIN(초상온도) < TA_MIN 확인 (2022: 13.1→12.1)
                         — "서리는 지표에서 먼저 온다" DOMAIN_REF §3 주장의 실측 근거
KMA 특보현황              현재 전국 발효 특보 없음 (`[]`)
KMA 격자변환              (128.1574, 36.4084) → nx=82, ny=103
Open-Meteo 예보 3일       9/16 돌풍 10.3 m/s — 드론 방제 임계값(5.0 m/s, F8 미검증치) 초과
Open-Meteo 과거실측 9/1~2  강수 15.5mm / 13.3mm
카카오 역지오코딩          상주시 낙양동 / 남원동
```

### 전체 파이프라인 흐름 (확정)

```
주소 입력
  → 위경도 추출                    카카오 geocoding
  → 최근접 관측소 찾기              stations.csv + geo.ts 의 greatCircleDistanceKm 재사용
  → 기후·위성 실측 pull            KMA + Open-Meteo (+ Sentinel-2, 키 복구 후)
  → 도메인 로직                    growth/recommendation 의 기존 순수 함수
  → LLM 조언 문장화                 F7
```

F1(텃밭 등록)이 이 전체 흐름의 전제 조건 — 구현 우선순위 1위로 확정. `greatCircleDistanceKm`
은 이미 `monitoring/domain/geo.ts` 에 있으므로 최근접 관측소 계산은 새 수학 없이
`stations.csv` 순회 + 기존 함수 호출로 끝난다.
