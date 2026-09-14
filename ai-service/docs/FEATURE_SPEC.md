# FEATURE_SPEC — 세이프팜 기능 정의서

> `DOMAIN_REF.md`(기상청 API허브 · Open-Meteo · Sentinel-2)에서 실제로 받을 수 있는
> 데이터와, 이미 구현된 도메인 로직(`src/features/*/domain`)을 근거로 기능을 정의한다.
> 근거 없는 기능은 넣지 않는다 — DOMAIN_REF 에 없는 데이터가 필요한 기능은 "미해결"로
> 남긴다.

**상태 표기**

```
구현    순수 로직·타입이 코드로 있음 (데모/상수 입력이라도)
설계    DOMAIN_REF·기존 문서에 근거는 있으나 코드 없음
미착수  근거도 코드도 없음. 아이디어 단계
```

---

## 0. 기능 지도

| # | 기능 | 트리거 | 주 데이터 출처 | 담당 모듈 | 상태 |
|---|---|---|---|---|---|
| F1 | 텃밭 등록 | 사용자 조작 (1회) | 카카오맵 역지오코딩 + `stations.csv`/`warn_regions.csv` + `nph-dfs_xy_lonlat` | (신설 필요) | 미착수 |
| F2 | 오늘의 생육 리포트 | 매일 새벽 배치 | Open-Meteo daily·hourly, 기상청 일통계 | `features/growth/domain` | 구현(로직) / 설계(입력 배선) |
| F3 | 작물 적합도 추천 | 등록 시 / 요청 시 | Open-Meteo daily (평균기온·강수·일조) | `features/recommendation/domain`, `graph` | 구현(로직) / 설계(입력 배선) |
| F4 | 재해 경보 | 매일 배치 + 특보 발표 시 | 기상청 특보현황, 절기별 작물재해(`TG_MIN`) | `features/growth/domain/growthAlerts.ts`, `features/monitoring/domain/hazards.ts` | 구현(임계값 일부) / 설계(특보 연동) |
| F5 | 위성 생육 확인(반대심문) | 5일 주기 (관측 있는 날만) | Sentinel-2 NDVI·NDWI·NDMI | `features/monitoring/domain/observation.ts` | 구현(타입) / 설계(실데이터 연동) — 현재 값은 데모 상수 |
| F6 | 평년 대비 판정 | 연 1회 갱신, 조회 시 비교 | 기상청 평년값(`arcltr_sfc_norm`) + Open-Meteo archive 30년 | (신설 필요) | 설계 |
| F7 | LLM 조언 문장화 | F2/F3 결과 생성 직후 | F2·F3·F4 의 계산 결과(payload) | `recommendation/graph/nodes.ts` (`makeExplainNode`) | 구현(추천 설명) / 미착수(생육 리포트용 문장화 — 현재는 규칙 기반 템플릿으로 대체) |
| F8 | 드론 방제 판정 | 조회 시 (3일 예보) | Open-Meteo hourly(풍속·강수확률) + sunrise/sunset | (신설 필요, `today_field.py` 언급만 있음) | 설계 |
| F9 | 지식 기반 Q&A (RAG) | 사용자 질문 | 농진청 문서 등 텍스트 자료 (임베딩 대상) | `ai-service/app/{knowledge,graph,api/ask.py}` | 미착수 (전부 TODO 스텁) |

DOMAIN_REF 의 4종 조회 키(§2), 결측 규칙(§5 `-999`/`null`), 시각대 2종(KST/UTC)은 F2~F6
전체가 공유하는 전제 조건이다. 기능별로 반복 서술하지 않는다.

---

## F1. 텃밭 등록

**왜 필요한가.** F2~F5 전부가 "이 밭이 어디인지"를 알아야 조회 키를 만들 수 있다.
DOMAIN_REF §2 "텃밭 등록 시 한 번에 해둘 것"이 그대로 이 기능의 명세다.

```
입력   사용자가 지도에 찍은 (lat, lon)
처리   ① stations.csv 최근접 관측소 계산        → station (stn)
       ② nph-dfs_xy_lonlat 호출                  → nx, ny
       ③ 역지오코딩 + warn_regions.csv 매칭       → warn_region (REG_ID)
       ④ Open-Meteo 응답의 elevation 을 참고 기록 (요청 좌표와 스냅 좌표가
         다를 수 있음 — DOMAIN_REF Open-Meteo §4)
출력   plots 문서 1건 (DATA_SCHEMA.md §2 참고)
```

**재계산 불필요.** 셋 다 텃밭 위치가 안 바뀌면 다시 계산할 이유가 없다(DOMAIN_REF §2).

**미해결**
- 카카오맵 역지오코딩 연동 방식 미정 (클라이언트 SDK vs 서버 프록시).
- `nph-dfs_xy_lonlat` 는 CGI형 — 실패 시 재시도/폴백 정책 없음.

---

## F2. 오늘의 생육 리포트

**이미 구현된 부분.** `growthReport.ts` 가 5부 구조(요약·표준단계·강점·부족점·경고)를
전부 순수 함수로 조립한다. 입력은 `GrowthObservation` 하나다:

```ts
cropId, daysSincePlanting,
recentAvgTempC, recentRainMm, sunshineHours,        // 최근 7일 관측
forecastMinTempC, forecastMaxTempC, forecastRainMm  // 향후 1~3일 예보
```

**배선이 안 된 부분.** 이 7개 필드를 실제로 채우는 코드가 없다. DOMAIN_REF 기준
매핑은 다음과 같다.

| `GrowthObservation` 필드 | 출처 | 계산 |
|---|---|---|
| `recentAvgTempC` | Open-Meteo `daily.temperature_2m_max/min` | 최근 7일 (max+min)/2 평균 |
| `recentRainMm` | Open-Meteo `daily.precipitation_sum` | 최근 7일 합 |
| `sunshineHours` | Open-Meteo `daily.shortwave_radiation_sum` 또는 기상청 묶음형 `mode=ss` | 근사 변환 필요 — **미해결** (직접 일조시간 변수 없음) |
| `forecastMinTempC` | Open-Meteo `daily.temperature_2m_min[1]`(내일) | 그대로 |
| `forecastMaxTempC` | Open-Meteo `daily.temperature_2m_max[0..2]` | 향후 3일 최대 |
| `forecastRainMm` | Open-Meteo `daily.precipitation_sum[0..2]` | 향후 3일 합 |
| `daysSincePlanting` | `cultivations.plantedDate` 와 오늘 날짜 차 | 사용자 입력 기준 |

**적산온도(GDD).** `growthStage.ts` 는 GDD 를 직접 계산하지 않고 "며칠째"로 단계를
판정한다. GDD 누적치 자체(랜딩 데모의 "384/797GDD")는 아직 코드가 없다 — 기상청
일통계(①)와 Open-Meteo archive(과거) 양쪽으로 계산 가능(DOMAIN_REF 기상청 §6,
Open-Meteo §6). **미착수.**

---

## F3. 작물 적합도 추천

`suitability.ts` 의 `scoreSuitability`/`rankCrops` 가 이미 구현되어 있고
`recommendation/graph` 가 LangGraph(JS) 로 조립까지 끝냈다. `WeatherFetcher` 인터페이스로
외부 의존이 주입되므로, 실제로 필요한 작업은 **Open-Meteo 호출 함수 하나 작성**뿐이다.

```ts
WeatherWindow = { avgTempC, rainfallMm, sunshineHours }
```

F2 의 `sunshineHours` 미해결과 동일한 문제를 공유한다. 재배 후보 목록
(`CandidateLoader`)은 `growthStage.ts` 의 `CROP_CALENDARS` 와 항목이 겹치지만
필드 형태가 다르다 — DATA_SCHEMA.md §4 참고.

---

## F4. 재해 경보

두 갈래로 나뉜다.

```
① 예보 기반 즉각 경고   growthAlerts.ts — 이미 구현. 작물별 임계값(frostRiskBelowC 등)
                        을 Open-Meteo 예보와 비교. 특보와 무관하게 동작.
② 공식 특보 반영        wrn_now_data_new.php — 미착수. 텃밭의 REG_ID + 상위 구역
                        전부를 확인해야 한다(DOMAIN_REF §4-5 my_regions 그대로 이식).
```

`HAZARDS`(`hazards.ts`)의 6종과 실제 데이터 출처 대응:

| `HazardKind` | 특보 코드(`wrn`) | 절기재해 `risk` | 비고 |
|---|---|---|---|
| `frost` | `C`(한파) | `01`(저온재해) | `TG_MIN`(초상온도)이 `TA_MIN`보다 정확 — DOMAIN_REF §3 |
| `heat` | `H`(폭염) | `02`(고온재해) | 일소재해(`03`)는 과수 전용이라 별도 구분 필요 — **미해결** |
| `drought` | `D`(건조) | `05`(홍수가뭄재해 중 가뭄 측) | |
| `flood` | `R`(호우) | `05`(홍수가뭄재해 중 홍수 측) | risk=05 는 홍수·가뭄을 함께 묶어 응답 — 필드 구조 미확인(DOMAIN_REF §3 "02~05 미확인") |
| `wind` | `W`(강풍)·`T`(태풍) | `04`(바람재해) | |
| `hail` | 대응 코드 없음 | 대응 없음 | **DOMAIN_REF 3종 출처 어디에도 우박 데이터 없음. 레이더 등 별도 출처 필요 — 현재 구현 불가** |
| (없음) | `S`(대설) | 대응 없음 | `HazardKind` 에 대설이 없다 — **타입 확장 필요** |

---

## F5. 위성 생육 확인 (반대심문)

DOMAIN_REF §7(Sentinel-2)의 표현을 그대로 쓴다 — "위성은 판정이 아니라 반대심문".
`observation.ts` 가 시계열 타입·`latestPoint`·`seriesRange` 를 이미 갖고 있지만
**값은 전부 데모 상수**(`observationData.ts`)다.

```
적산온도가 "이쯤이면 이래야 한다" 계산 → NDVI 로 "실제로 그런가" 확인
NDVI 정체·하락           → 생육이 더디다
NDVI 유지 + NDMI 하락    → 물이 모자라다
```

**결측이 절반을 넘는다(DOMAIN_REF §6).** 이 기능은 "매일" 갱신될 수 없다 — F2 처럼
매일 배치가 아니라 "관측 있는 날만" 갱신되는 보조 신호로 설계해야 한다. 유효 픽셀
70% 미만 또는 이상치(앞뒤 대비 급락)는 `is_valid=false` 로 걸러야 함 — DATA_SCHEMA.md
`satellite_obs` 참고.

`observation.ts` 는 `ndvi`·`ndmi` 두 값만 다루는데, DOMAIN_REF 계산식은 `ndwi` 도
포함한다(논 물떼기 확인용, §7). **미해결 — 타입 확장 필요.**

---

## F6. 평년 대비 판정

"이번 봄은 평년보다 1.8도 높습니다" 류의 문장. 학습 없이 통계만으로 만들 수 있는
기능이라 `docs/safefarm_답변.md` §4 가 1차 우선순위로 꼽는다. 데이터는 두 출처가
서로 검증 관계다.

```
기상청 arcltr_sfc_norm.php   norm=D, tmst=2021 (1991~2020)   ← 공식값
Open-Meteo archive           1991-01-01~2020-12-31            ← 자체 계산, 대조용
```

**미착수.** 코드도, DB 테이블(`normals`)도 없다.

---

## F7. LLM 조언 문장화

`recommendation/graph/nodes.ts` 의 `makeExplainNode` 가 추천 결과(F3)에 대해서만
구현되어 있다. F2 의 생육 리포트는 `growthReport.ts` 가 **규칙 기반 템플릿 문장**으로
이미 사람이 읽을 문장을 만들고 있어 LLM 호출이 없다 — `docs/safefarm_답변.md` §3 의
"판단은 코드, 문장은 Claude" 원칙과 맞지만, 리포트 쪽은 아직 "문장도 코드"인 상태다.
지금 문장 품질로 충분한지, LLM 문장화가 더 필요한지는 제품 판단 — **의사결정 필요.**

---

## F8. 드론 방제 판정

`docs/safefarm_답변.md`(부록)에 `today_field.py` 언급이 있으나 실제 파일은 없다.
DOMAIN_REF Open-Meteo §3-2 가 요청 예시를 이미 제공한다.

```
판정 축   풍속(wind_speed_10m, m/s) · 강수확률(precipitation_probability)
         · 시각(sunrise~sunset 사이)
기준값    풍속 3.0 / 돌풍 5.0 / 습도 60 / 기온 28 / (안전창 150분)
         — safefarm_답변.md 데모 부록: "농민·방제지침 확인 필요"라고 명시된
           **미검증 값**. 그대로 임계값으로 쓰지 말 것.
```

**미착수.** 임계값 출처부터 확인해야 한다(농진청 방제 지침).

---

## F9. 지식 기반 Q&A (RAG)

`ai-service` 전체가 이 기능 하나를 위한 스캐폴딩이다. 현재 상태:

```
app/models/{document,chunk}.py     비어 있음 — SQLAlchemy 모델 없음
app/knowledge/chunker.py           split_into_chunks() → NotImplementedError
app/knowledge/embedder.py          embed_texts() → NotImplementedError
app/knowledge/vector_store.py      search() → NotImplementedError
app/api/{ask,recommend}.py         비어 있음 — 엔드포인트 없음
pipeline/{load_data,chunk,embed,run_all}.py   전부 비어 있음
requirements.txt                   pgvector 파이썬 패키지 없음 (psycopg2-binary만 있음)
```

F1~F8 과 입력·출력이 겹치지 않는 **독립 기능**이다 — 여기 임베딩되는 것은 농진청
문서 같은 정적 텍스트지, 기상·위성 시계열이 아니다. DOMAIN_REF.md 자체를 이 RAG의
지식 소스로 넣을지(개발자 참고용 문서라 사용자 질문 답변에는 부적합해 보임)는
**결정 필요.**

---

## 부록 — 기능이 아닌 것 (근거 부족으로 제외)

`docs/safefarm_답변.md` §4 가 이미 조사해 둔 내용을 그대로 따른다.

```
사진 병해충 판별      우리 라벨 데이터 없음 (공개 데이터셋은 존재)
텃밭 개별 수확량 예측   통계청 공표가 시군/시도 단위까지만 — 텃밭 단위 정답 없음
채소 수확량 예측       시도 단위 공표뿐 — 텃밭 단위 불가
```

F2 의 생육일기 체크박스·F8 실패 사유 체크는 지금 당장 쓰기 위해서가 아니라, 나중에
이 라벨이 필요해질 때 쌓여 있게 하려는 설계다(같은 문서 §4 "1차부터 라벨이 모이게
설계합니다"). 이 문서에서는 F2 의 하위 항목으로만 취급한다.
