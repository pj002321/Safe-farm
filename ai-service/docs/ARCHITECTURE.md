# ai-service 아키텍처

기후·위성 데이터로 작물 위험을 판정하고 LLM 으로 설명·추천을 만드는 **Python
FastAPI 서버**. Next 앱(`src/`)이 내부망으로 부르는 백엔드이고, 인터넷에 직접
열리지 않는다.

코딩 규칙은 `docs/CONVENTIONS.md` 가 정본이다. 이 문서는 **구조가 왜 이 모양인지**만
적는다. 실제 요청이 어떤 순서로 무엇을 타는지는 `docs/MAIN_FLOWS.md`.

---

## 1. 서비스 경계

```
브라우저 ──▶ Next(src/) ──▶ ai-service ──▶ Postgres(Supabase)
                  │                └────────▶ OpenAI
                  └──▶ Supabase(직접 읽기, RLS)
```

- **인터넷에 공개 도메인을 붙이지 않는다.** LLM 엔드포인트가 같은 앱에 있어,
  열면 남이 우리 토큰 요금을 쓴다. 크론도 Next 를 치고 Next 가 여기를 부른다.
- 모든 라우터가 `require_service_token` 을 건다. 헤더가 없거나 다르면 401,
  `AI_SERVICE_TOKEN` 이 환경에 아예 없으면 503 이다 — **설정 누락과 인증 실패를
  구분해서 알린다.** 둘을 같은 코드로 내면 배포 사고를 사용자 입력 탓으로 읽는다.
- **DB 는 `postgres` 역할로 붙는다. RLS 를 타지 않는다.** 그래서 "내 것인가"는
  규칙이 아니라 **코드가** 봐야 한다. 그 자리가 `repo/plot.owned_plot` 이다.
  `user_id` 는 Next 가 세션 쿠키로 확인해 실어 보낸 값만 믿는다.

## 2. 층

```
api → service → (repo, domain)
              ↘ graph, knowledge
```

| 층 | 하는 일 | 규칙 |
|---|---|---|
| `core/` | 설정·DB 엔진·토큰 검증 | 업무 판단 없음 |
| `models/` | SQLAlchemy 테이블 정의 | 쿼리 없음 |
| `repo/` | **쿼리의 유일한 자리.** 값만 넘긴다 | 가공·판단·commit 없음 |
| `domain/` | 순수 로직 | I/O·환경변수 없음 |
| `service/` | repo 와 domain 을 합친다 | HTTP 를 모른다 |
| `knowledge/` | RAG 런타임(청킹·임베딩·검색·생성) | — |
| `graph/` | LangGraph 노드·엣지 | 환경변수를 읽지 않는다 |
| `api/`, `schemas/` | 엔드포인트와 요청/응답 계약 | 쿼리 없음 |
| `pipeline/` | 오프라인 배치 CLI | 런타임에서 import 되지 않는다 |

### 이 층 나눔이 실제로 막는 것

층을 나눈 이유가 "깔끔해서"가 아니다. 다음 셋은 전부 **예외 없이 조용히 틀린 값을
내던 버그**였고, 층을 지키면 구조적으로 안 난다.

| 겪은 일 | 원인 | 이제 막는 곳 |
|---|---|---|
| 지운 밭에 할 일 카드가 계속 쌓임 | `deleted_at is null` 을 손으로 적는 자리가 5곳, 1곳 누락 | `repo/plot.py` |
| 같은 밭을 `/ask` 와 리포트가 다른 작물로 말함 | 대표 재배 건 조회 두 벌 중 한쪽만 `deleted_at` 검사 | `repo/cultivation.py` |
| `base_temp` 가 빈 작물 하나가 자정 배치 전체를 죽임 | `float(None)`. 가드가 호출부마다 흩어져 있었음 | `repo/crop.usable_crop_of_variant` |

- **`repo/` 는 표 하나에 모듈 하나.** repo 끼리 import 하지 않는다 — 엮이면
  "이 함수가 쿼리를 몇 번 날리나"를 호출부에서 셀 수 없게 된다.
- **repo 는 commit 하지 않는다.** 트랜잭션 경계는 service 가 쥔다. 할 일 카드는
  "만료 처리 + 신규 생성"이 한 단위여야 한다.
- 위 규칙은 `tests/test_queries_live_in_repo.py` 가 AST 로 검사한다. 사람이
  리뷰에서 잡는 방식은 이미 세 번 실패했다.
- 예외는 `knowledge/` 하나다. pgvector 연산자(`<=>`)와
  `set local hnsw.iterative_scan` 은 **같은 트랜잭션 안에서만** 의미가 있어,
  호출부와 떼어 놓으면 효과가 조용히 사라진다.

## 3. 데이터

표가 두 스키마에 나뉘어 있다. **이름이 비슷해서 제일 자주 헷갈리는 지점이다.**

| 스키마 | 표 | 키 | 쓰는 곳 |
|---|---|---|---|
| `farm` | `plots` · `cultivations` · `plot_tasks` · `advices` · `ask_history` | uuid | 사용자별 화면 |
| `farm` | `crops` · `crop_variants` · `crop_stages` | 정수 | 작물 마스터(정적) |
| `farm` | `weather_obs_daily` | `station_code` | **밭 하나**의 GDD·강수 |
| `weather` | `weather_daily` | `plot_id` | **지도 레이어**(시군구 250개) |
| `weather` | `normals` · `official_alerts` | — | 평년값·기상특보 |

- `weather_daily` 에 관측소를 넣을 때는 `stn:<지점번호>` 꼴의 가짜 `plot_id` 를
  쓴다(`domain/gdd.station_plot_id`). 지도용 표를 밭과 같은 모양으로 재활용한 것이다.
- **삭제는 전부 soft delete** 다. `deleted_at` 이 남으므로 `db.get()` 으로는 지운
  것도 그대로 잡힌다 — 그래서 조회를 repo 로 모았다.
- **누적 GDD 는 저장하지 않는다.** 매번 관측에서 다시 쌓는다(웹의 `gdd.ts` 와 같은
  방침). 증분 누적은 한 번 어긋나면 되돌릴 방법이 없다.
- 평년값 `normals` 에는 기간이 다른 두 벌(`kma`, `kma-1981`)이 같이 있다.
  **섞어 평균 내지 않는다** — 어느 30년에도 해당하지 않는 값이 된다. 관측소마다
  있는 쪽 한 벌만 쓴다.

## 4. LLM 을 부르는 세 자리

| 자리 | 무엇 | 얼마나 |
|---|---|---|
| `/v1/ask` | RAG 질의응답. LangGraph 로 돈다 | 사용자당 **일일 한도**(`DAILY_ASK_LIMIT`) |
| `/v1/reports/{plot_id}` | 밭 하나의 생육 리포트 | 재배 건당 **하루 한 번**, `advices` 에 캐시 |
| `/v1/reports/farm-summary` | 사용자 밭 전체 총평 | 사용자당 **하루 한 번**, `farm_advices` 에 캐시 |

캐시 표가 곧 **호출 자물쇠**다. "오늘 것이 있나"를 먼저 보고 없을 때만 부른다.

## 5. LangGraph (`graph/`)

`graph/` 는 독립 층이 아니라 **service 가 쓰는 수단**이다. DB 세션과 LLM 은
state 나 팩토리 인자로 받는다 — 노드 안에서 모델을 만들면 테스트가 불가능해진다.

두 벌이 들어 있다.

- **ask-flow** (`build_graph_default`) — `plan → (run_tools) → retrieve → generate`.
  `plan` 이 밭 조회가 필요한지 정하고, 필요 없으면 곧장 `retrieve` 로 간다.
  **`retrieve` 는 경로와 무관하게 항상 돈다** — tool 경로에서 RAG 근거를 빼면
  밭 정보만 보고 답하게 된다.
- **작물 추천** (`build_graph` / `create_graph`) — 기상 수집 → 후보 적재 → 랭킹 →
  설명. 노드를 갈아끼울 수 있게 미컴파일 형태도 같이 둔다.

checkpointer 를 붙일 때는 `serde=create_checkpoint_serde()` 를 같이 넘긴다.
안 넘기면 state 의 dataclass 가 복원 때 **조용히 dict 가 된다.**

## 6. 판정을 보류하는 규칙

전체를 관통하는 방침이라 따로 적는다.

> **근거를 못 만들면 값을 만들지 않는다.**

- `base_temp` 가 없으면 GDD 는 0 이 아니라 `None` 이다. 기본값으로 메우면 작물별
  값인 척하는 틀린 숫자가 되고, 그 위의 생육단계·물주기 카드가 전부 거짓 근거가
  된다.
- 관측이 하나도 없는 구간의 누적 강수량은 0mm 가 아니라 `None` 이다.
- 없는 밭과 남의 밭을 구분해 알리지 않는다. 구분하는 순간 "그 id 의 밭이 있다"는
  사실이 샌다.
