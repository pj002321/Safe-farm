# ai-service 코딩 컨벤션

`AGENTS.md` 는 도구가 읽는 요약이고, 이 문서는 **왜 그렇게 쓰는지**까지 적은 정본이다.
둘이 어긋나면 이 문서가 맞다. 루트 `AGENTS.md` 의 Next.js·Supabase RLS 규칙은
여기 적용하지 않는다.

## 1. 층과 의존 방향

```
api → service → (repo, domain)
              ↘ graph, knowledge
```

| 층 | 하는 일 | 하지 않는 일 |
|---|---|---|
| `core/` | 설정·DB 엔진·토큰 검증 | 업무 판단 |
| `models/` | SQLAlchemy 테이블 정의 | 쿼리 |
| `repo/` | 쿼리. 값만 넘긴다 | 가공·판단 |
| `domain/` | 순수 로직. 프레임워크·DB 무관 | I/O, 환경변수 |
| `service/` | repo 와 domain 을 합쳐 api 에 올린다 | HTTP 를 안다 |
| `knowledge/` | RAG 런타임 (청킹·임베딩·검색·생성) | 라우팅 |
| `graph/` | LangGraph 노드·엣지 | 환경변수 읽기 |
| `api/`, `schemas/` | 엔드포인트와 요청/응답 계약 | 쿼리 |
| `pipeline/` | 오프라인 배치 CLI | 런타임 경로에서 import 되기 |

- **`repo/` 는 지금 비어 있다.** 쿼리가 `service/` 안에 있다(`ask_context.py`
  등). 한 파일이 쿼리와 가공을 같이 하게 되면 그때 `repo/` 로 뗀다 — 비어 있는
  칸을 채우려고 미리 나누지 않는다.
- `graph/` 는 독립 층이 아니라 service 가 쓰는 수단이다. DB 세션·LLM 은 state 나
  팩토리 인자로 받는다. 노드 안에서 모델을 만들면 테스트가 불가능해진다.
- 점수 로직(`domain/suitability.py`)은 프런트에도 한 벌 더 있다. 정본 미정.

## 2. 이름

| 대상 | 규칙 | 예 |
|---|---|---|
| 모듈·함수·변수 | `snake_case` | `build_plot_context` |
| 클래스 | `PascalCase` | `AskHistory`, `PlotFocus` |
| 모듈 상수 | `UPPER_SNAKE` | `DAILY_ASK_LIMIT`, `RRF_K` |
| 비공개 | 앞에 `_` | `_owned_plot`, `_normalize` |
| 테스트 | `test_<대상>.py` · `test_<무엇이_어떻게>` | `test_rrf_ignores_score_magnitude` |

- 함수 이름은 **동사로 시작**한다(`build_`, `load_`, `search_`, `record_`).
  값을 돌려주는 조회는 `get_` 대신 무엇을 주는지로 부른다(`recent_turns`).
- 매직넘버를 코드에 박지 않는다. 모듈 상수로 올리고 `#:` 주석으로 근거를 적는다.
  실측값이 아니면 **실측값이 아니라고 적는다**(`RRF_K`, `OVERLAP_WEIGHT`).

## 3. docstring

공개 함수는 `# summary / # params / # returns / # examples` 절을 이 순서로 쓴다.
세부 규칙(`<br>`, 절 제목은 영어, 내용은 한국어)은 `AGENTS.md` 에 있다.

산문형 한 줄 docstring 을 쓰는 자리는 둘뿐이다.

- 비공개 헬퍼(`_` 로 시작)
- 라우터 함수·얇은 래퍼 — 계약이 스키마(`schemas/`)에 이미 적혀 있는 경우

모듈 docstring은 **무엇을 하는 파일인지 + 왜 이 자리에 있는지**를 적는다.
파일명을 되풀이하지 않는다.

## 4. 주석

- **`~함` 체 반말.** "알아본다" 말고 "알아봄". 사용자에게 나가는 문구만 존댓말이다.
- **무엇을 하는지는 코드가 말한다. 주석은 왜를 적는다.** 특히 "안 그러면 무슨 일이
  생기는지" 를 적는다.
- 지워야 할 코드는 주석 처리하지 말고 지운다. git 이 기억한다.
  `# 찐빠라 주석 처리함` 같은 블록을 남기지 않는다.
- 파일 밖의 사실을 적을 때는 경로를 같이 쓴다(`supabase/migrations/...sql`).

## 5. 결정 보류 — `_{n}` 변형

근거 없이 지금 고르면 굳어 버리는 규칙은 **함수를 두 벌 두고 한 줄로 갈아 끼운다.**

```python
HybridRule = Callable[[Ranked, Ranked], dict[int, float]]   # 공유 타입

def hybrid_score_1(...): ...   # RRF
def hybrid_score_2(...): ...   # 가중합

SCORE_RULE: HybridRule = hybrid_score_1   # ← 바꿀 땐 이 줄만
```

지키는 것:

1. 변형은 **모양이 같아야 한다.** 안 쓰는 인자도 받아서 버린다(`del clip`).
2. 갈아 끼우는 지점은 **모듈당 하나**다. `if` 로 분기하지 않는다.
3. 각 변형의 docstring에 **무엇을 잃는지**를 적는다. 장점만 적으면 고를 수 없다.
4. 선택이 끝나면 진 쪽을 지우고 이름에서 `_{n}` 을 뗀다. 남겨 두지 않는다.

현재 미결: `knowledge/hybrid.py` 의 `SCORE_RULE`,
`domain/history_context.py` 의 `HISTORY_RULE`.

## 6. 타입·예외

- 공개 함수는 인자와 반환에 타입을 전부 붙인다. `Any` 는 쓰지 않는다.
- `X | None` 을 쓴다(3.10 문법까지만. `type` 문·`Self` 금지 — `pyproject.toml` 참조).
- **못 찾은 것은 `None`, 잘못 쓴 것은 예외.** 조회가 빈손이면 `None`/빈 리스트를
  돌려주고, 계약을 어긴 호출(개수 불일치 등)은 `ValueError` 로 즉시 멈춘다.
- 광범위 `except` 는 **외부 경계에서만** 쓴다(네트워크·LLM). 삼키지 말고 실패
  상태로 바꿔 흐름을 정상 종료시키고, `noqa: BLE001` 옆에 이유를 적는다.
- 없어서는 안 되는 환경변수는 쓰는 자리에서 `RuntimeError` 로 멈춘다. 기본값으로
  때우면 키 없이 도는 것처럼 보인다.

## 7. DB

- **정본은 `supabase/migrations/*.sql` 이다.** 모델(`models/`)은 같은 모양을 파이썬
  쪽에 복사해 둔 것이다. 컬럼을 더하면 **둘 다** 고친다 — 한쪽만 고치면 새로 만든
  DB 와 이미 있는 DB 의 모양이 갈린다.
- `models/farm/` 은 Next.js 와 공유하는 테이블이다. `init_farm_db` 의
  `EXTERNAL_TABLES` 에 든 것은 `create_all` 대상이 아니다 — RLS 없는 반쪽 테이블이
  생기는 걸 막는다.
- `models/`(farm 밖)의 `documents`·`chunks` 는 ai-service 가 만든다.
- ai-service 는 슈퍼유저로 붙어 **RLS 를 타지 않는다.** 사용자 소유 확인은
  코드가 직접 한다(`_owned_plot`). 없는 것과 남의 것을 구분해 알리지 않는다.
- soft delete 를 쓰는 테이블은 조회마다 `deleted_at is null` 을 건다.
- 누적 GDD 는 저장하지 않는다. 매번 관측에서 다시 쌓는다.

## 8. 테스트

- 대상은 `domain/` 순수 함수와 `knowledge/` 의 점수·정렬 로직이다. DB·LLM 이
  필요한 코드는 테스트하지 않는다.
- 이름이 곧 주장이다. `test_<대상>_<조건>_<결과>`.
- 부동소수 비교는 `round(x, 6)` 으로 한다. `== 0.3` 은 통과하지 않는다.
- 실행: `py -3.12 -m pytest -q` (기본 python 3.9 에는 의존성이 없다).
  한글이 깨지면 `PYTHONIOENCODING=utf-8`.

## 9. 린트

```bash
py -3.12 -m ruff check app pipeline tests
py -3.12 -m ruff check --fix --select I001 .   # import 정렬만
```

- 규칙은 `pyproject.toml` 의 `select = ["E", "F", "I", "UP", "B"]`. 줄 길이 100.
- 예외는 규칙을 끄지 말고 **파일 단위로** 둔다
  (`per-file-ignores` 의 `app/api/*.py` → `B008`: FastAPI 의 `Depends()` 기본값).

## 10. 사람이 읽는 문구

- 사용자에게 나가는 문구는 한국어 존댓말. `app/` 안에서 하드코딩하되 상수로 올린다
  (`BLOCKED_MESSAGE`, `DAILY_LIMIT_MESSAGE`).
- 자유 입력(피드백 사유 등)은 개인정보가 섞인다고 보고 **되돌려 주지 않는다.**
- 오류 문구에 내부 사정(테이블명·id·스택)을 싣지 않는다.

## 11. git

Agent 는 commit·push 하지 않는다. `ai-service/.env` 는 커밋에 넣지 않는다.
