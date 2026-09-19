# ai-service 주요 흐름

요청 하나가 **무엇을 어떤 순서로 타는지**. 구조가 왜 이 모양인지는
`docs/ARCHITECTURE.md`, 코딩 규칙은 `docs/CONVENTIONS.md`.

읽는 법: 각 흐름마다 ① 경로 ② 거치는 파일 ③ **틀리기 쉬운 지점** 순이다.
③ 이 이 문서의 본론이다 — 나머지는 코드를 따라가면 보인다.

---

## 1. `/v1/ask` — RAG 질의응답 (SSE)

### 경로

```
POST /v1/ask
 │
 ├─ 0. 일일 한도 확인 ──────────────── 남은 게 없으면 여기서 끝(LLM 안 부름)
 ├─ 1. 가드레일(주제 밖?) ─────────── 막혀도 한도는 깎는다
 ├─ 2. 직전 대화 몇 턴 읽기 ────────── ★ 이번 질문을 남기기 **전에**
 ├─ 3. ask_history 에 질문 기록
 └─ 4. StreamingResponse ── LangGraph ask-flow
          ┬─ plan ──(밭 조회 필요?)──▶ run_tools ─┐
          └─ retrieve ──────────────────────────┴─▶ generate
```

`plan` 과 `retrieve` 는 **같이 출발한다.** `retrieve` 가 `plan` 의 결과를 안 쓰는데
뒤에 서 있을 이유가 없다 — `docs/OPTIMIZATION.md` 3절 ②.

### 거치는 파일

| 단계 | 파일 |
|---|---|
| 한도 | `api/ask.py:_quota` → `service/ask_history.today_ask_count` → `repo/ask_history.count_since` |
| 가드레일 | `domain/guardrail.is_blocked_topic` (순수 함수) |
| 대화 맥락 | `service/ask_history.recent_turns` → `repo/ask_history.recent_answered` → `domain/history_context.HISTORY_RULE` |
| plan | `graph/nodes.plan` |
| 밭 조회 | `tools/tools.py` → `service/ask_context.build_plot_context` |
| retrieve | `graph/nodes.retrieve` → `knowledge/retriever.find_matches` → `knowledge/vector_store` |
| generate | `graph/nodes.generate` → `knowledge/generator.stream_answer` |
| 답변 저장 | `service/ask_history.complete_answer` |

### 틀리기 쉬운 지점

- **이력은 이번 질문을 기록하기 전에 읽는다.** 뒤로 미루면 방금 한 질문이 자기
  자신의 맥락으로 딸려 들어간다.
- **가드레일에 막혀도 한도를 깎는다.** 안 깎으면 금지어를 섞어 한도 없이 두드릴 수
  있다.
- **`retrieve` 는 경로와 무관하게 항상 돈다.** tool 로 갔다고 RAG 근거를 빼면 밭
  숫자만 보고 답한다. 그래서 `route_after_plan` 은 "generate" 를 돌려준다 —
  "retrieve" 를 가리키면 START 에서 한 번, plan 뒤에 또 한 번 돈다.
- **`generate` 의 `defer=True` 를 빼지 말 것.** 합류 노드는 늦게 오는 가지를 안
  기다린다. 빼면 tool 경로에서 답이 **두 번** 흐르고 첫 번째는 밭 정보가 없다.
- **`plan` 에서 DB 를 만지지 말 것.** `retrieve` 와 다른 스레드로 돈다.
- **`matches` 와 `evidence` 는 크기가 다르다.** 출처 칩으로 보여줄 top-k 가
  `matches`, LLM 에 줄 근거는 거기에 같은 문서의 **앞뒤 조각**을 더한 `evidence` 다.
  "방울토마토 물"의 정답이 뽑힌 조각 바로 옆에 있었다(골든 hint 29→31).
- **`plot_id` 가 있으면 그 밭의 작물로 검색을 좁힌다.** 질문에 작물 이름이 없으면
  ("밀린 일 알려줘") 필터 없이 전체를 뒤져, 우연히 벡터가 가까운 무관한 문서가
  섞인다 — 실제로 '밀린 일'을 '밀' 문서로 답했다(2026-09-18).
- **SSE 순서는 `meta → matches → token… → done`.** `meta` 가 맨 앞인 이유는
  프런트가 `historyId` 를 먼저 받아야 피드백 대상을 알고 잔여 횟수를 곧바로 줄여
  보여줄 수 있어서다.
- **예외가 나면 `error` 이벤트를 반드시 보낸다.** 조용히 끊으면 프런트는 짧은
  답변을 정상 완료로 읽는다. 받은 데까지는 이력에 남긴다 — 이미 한도를 깎았다.
- 답변은 **스트림이 끝난 뒤 한 번** 저장한다. 토큰마다 커밋하면 DB 왕복이 토큰
  수만큼 는다.

---

## 2. `/v1/reports/{plot_id}` — 생육 리포트

### 경로

```
GET /v1/reports/{plot_id}?user_id=…
 │
 ├─ 1. owned_plot ─────────────── 남의 밭·지운 밭이면 PLOT_NOT_FOUND
 ├─ 2. build_report_input ─────── 근거 수집. 못 만들면 NO_GROWTH_DATA
 │       ├ nearest_station           관측소 없으면 None
 │       ├ compute_plot_growth       GDD 누적 → 현재 생육단계
 │       ├ rainfall_totals(7일)
 │       ├ Open-Meteo 예보 7일       ← 실패해도 리포트는 만든다
 │       ├ 기상특보                  ← 실패해도 리포트는 만든다
 │       └ daily_gdd_series(14일) → days_to_target
 └─ 3. get_cached_or_generate_report
         ├ advices 에 오늘 것이 있나? ── 있으면 그대로(LLM 안 부름)
         └ 없으면 LLM → advices 에 저장
```

### 응답이 `available: false` 인 네 가지

| reason | 뜻 |
|---|---|
| `PLOT_NOT_FOUND` | 없는 밭 **또는** 남의 밭. **구분하지 않는다** |
| `NO_PLOTS` | 밭을 아직 안 만듦(총평 전용) |
| `NO_GROWTH_DATA` | 밭은 있는데 근거를 못 만듦(관측소 없음·작물 없음·`base_temp` 없음) |
| `GENERATION_FAILED` | LLM 호출 또는 캐시 조회 실패 |

### 틀리기 쉬운 지점

- **외부 API 실패가 리포트 전체를 막지 않는다.** 예보와 특보는 `try` 로 감싸
  실패하면 `None`/빈 목록으로 두고 계속 간다. 반대로 **관측소와 생육단계는 없으면
  중단**한다 — 그건 리포트의 뼈대다.
- **`advices` 조회가 곧 호출 자물쇠다.** 재배 건당 하루 한 번. 캐시 조회가 실패하면
  LLM 을 부르지 않고 `GENERATION_FAILED` 로 돌린다 — 못 저장할 답을 만들면 다음
  요청이 또 부른다.
- **`input_snapshot` 을 같이 남긴다.** 그날의 입력이 없으면 "이 답이 왜 나왔나"를
  되짚을 수 없다.
- `warnings` 를 낼 때 **`plot.region_code` 를 넘기지 말 것.** 법정동 코드라 특보 표의
  통계청 코드와 체계가 다르다. 좌표로 넘긴다.

---

## 3. `/v1/tasks/generate*` — 오늘 할 일 카드

### 경로

```
POST /v1/tasks/generate      (밭 하나)   ← 밭·재배를 만든 직후 Next 가 부른다
POST /v1/tasks/generate-all  (전체)      ← 매일 00시(KST) 크론
 │
 └─ generate_tasks_for_plot(db, plot)
      ├─ 1. expire_stale_tasks ──── ★ 판정보다 **먼저**
      ├─ 2. lead_growing            기르는 작물 없으면 건너뜀(이유를 로그에)
      ├─ 3. usable_crop_of_variant  base_temp 없으면 건너뜀
      ├─ 4. nearest_station / compute_plot_growth / 최근 강수
      ├─ 5. build_task_candidates   ← 순수 함수. 여기가 판정의 전부
      ├─ 6. open_titles 와 대조해 중복 제거
      └─ 7. add_task × N → commit
```

### 틀리기 쉬운 지점

- **만료를 판정보다 먼저 한다.** 순서를 바꾸면 방금 만든 카드가 같은 실행에서
  닫힌다.
- **만료는 날짜 경계로 자른다.** "지금부터 72시간 전"으로 하면 배치가 도는 시각이
  몇 분만 밀려도 경계에 걸친 카드가 어떤 날은 닫히고 어떤 날은 안 닫힌다.
- **중복 판정 기준은 제목이다.** 그래서 `domain/task_rules` 의 후보 제목은 고정
  문구여야 한다. 제목에 날짜·수치를 넣기 시작하면 매일 새 카드가 쌓인다.
- **살아 있는 카드만 중복으로 센다.** 닫힌 카드까지 세면 한 번 나온 제목이 영영
  다시 안 나와 만료 처리가 무의미해진다.
- **밭 하나가 실패해도 배치는 계속 간다.** `generate_daily_tasks` 가 밭마다
  `try/except` + `rollback` 을 건다. 이게 없어서 `base_temp` 결손 하나가 자정 배치
  전체를 죽인 적이 있다.
- **0건이 정상인 경로가 하나뿐이다** — "조건을 봤는데 할 일이 없었다". 나머지
  0건(작물 없음·근거 없음)은 이유를 로그에 남긴다. 안 남기면 `created: 0` 만 보고
  "데이터가 없다"와 "할 일이 없다"를 구분할 수 없다.
- **만료 처리는 새 카드가 0건이어도 커밋한다.** 조건이 해소돼 후보가 없는 날에도
  오래된 카드는 닫혀야 한다.

---

## 4. `/v1/map/*` — 시군구 지도 레이어

### 경로

```
GET /v1/map/sigungu-gdd   → service/gdd_region.py     → repo/weather_daily, repo/normal
GET /v1/map/sigungu-rain  → service/weather_region.py → repo/weather_daily
GET /v1/map/sigungu-wind  → service/weather_region.py → repo/weather_daily
GET /v1/map/sigungu-warn  → service/warn_region.py    → repo/alert
```

참조 CSV(`sigungu.geojson`, `sigungu_station.csv`, `warn_regions.csv`)는 요청마다
읽지 않고 `lru_cache` 로 들고 있는다.

### 틀리기 쉬운 지점

- **`weather_daily` 는 `plot_id` 가 키다.** 관측소를 넣을 때 `stn:<지점번호>` 꼴의
  가짜 id 를 쓴다(`domain/gdd.station_plot_id`). `farm.weather_obs_daily` 와 다른 표다.
- **강수·바람은 `kind = 'obs'` 를 반드시 건다.** 안 걸면 예보를 실측인 것처럼 칠한다.
- **평년값 두 벌을 섞지 않는다.** `kma`(최신 30년, 174곳)와 `kma-1981`(72곳)은
  기준 연대가 달라 평균 내면 어느 30년에도 해당하지 않는 값이 된다. 관측소마다
  앞에서부터 찾아 있는 쪽 한 벌만 쓴다. `kma` 만 고집하면 143(대구)·146(전주)가
  통째로 빈다.
- **특보 표는 append-only 다.** `fetched_at` 최댓값 스냅샷 하나만 본다. 안 그러면
  해제된 특보가 계속 잡힌다.

---

## 5. `/v1/weather/plot` — 밭 좌표 예보

Open-Meteo 를 **요청당 한 번** 부르고(실황+시간별+일별을 한 응답으로), DB 는
지난 실측과 우리 데이터만 본다. 화면이 밭마다 부르므로 여기서 왕복을 늘리면 밭
수만큼 곱해진다.

예보는 좌표별로 잠깐 캐시된다(`FORECAST_CACHE_TTL`). 같은 동네 밭 셋이 예보를
한 번만 받는다 — `docs/OPTIMIZATION.md` 2절.

**소유 확인은 `user_id` 로 한다.** `plot_id` 와 `user_id` 가 둘 다 와야
`owned_plot` 을 타고, 그때만 `growthSeries`·`cropImpact`·`alert` 가 채워진다.
남의 밭과 없는 밭은 같은 모양(전부 None)으로 답한다.

좌표 부분(실황·시간별·일별·누적 강수량)은 `user_id` 없이도 그대로 나간다.
지도에서 찍으면 나오는 공개값이고, 막으면 예보 카드가 통째로 죽는다.

> ⚠ **`user_id` 는 아직 선택값이다.** Next 호출부
> (`shared/aiService/client.ts` 의 `plotForecast`, 호출 3곳)가 아직 안 보낸다.
> 안 보내면 밭 값이 빈 채로 나가고 `[weather] user_id 없이 plot_id 가 왔다`
> 경고가 남는다. 호출부가 다 고쳐지면 필수로 올린다 — 그때 Next 의 데이터 캐시
> 키가 사용자별로 갈린다(`docs/OPTIMIZATION.md` 3절).

---

## 6. 공통 — 매 요청 도는 것

| 무엇 | 어디 | 비용 |
|---|---|---|
| 서비스 토큰 검증 | `core/security.require_service_token` | 문자열 비교 |
| DB 세션 | `core/db.get_db` | 커넥션 풀 |
| 관측소 전체 | `repo/station.all_stations` | **프로세스 캐시**. 첫 요청만 DB |
| 작물 이름 집합 | `knowledge/retriever.known_crops` | **프로세스 캐시** |
| 참조 CSV | `service/sigungu_ref` 등 | `lru_cache` |

프로세스 캐시는 **워커마다 따로** 찬다. 마스터를 다시 심었으면 재기동한다 —
연 1회 수준이라 그 편이 싸다.
