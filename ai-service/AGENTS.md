# AGENTS.md

<!-- agents.md 공개 스펙 파일. Claude Code 외 다른 AI 코딩 도구(Cursor, Codex, Aider, Gemini CLI 등)도 이 파일을 읽는다.
     이 저장소에서는 "도구 무관 공통 지침"만 여기 쓰고, Claude Code 전용 사항은 CLAUDE.md에 남긴다.
     (지금 CLAUDE.md 는 `@AGENTS.md` 한 줄짜리 포인터다.) -->

작물 추천 · 질의응답 AI 서버. Python 3.10+ · LangGraph.
설치·명령은 `README.md`, 설계 배경과 미결정 사항은 `archi_base.md`.
**코딩 컨벤션 정본은 `docs/CONVENTIONS.md`** — 여기 적힌 건 요약이고, 어긋나면
그쪽이 맞다. 레포 전체 규칙(브랜치 · Supabase)은 루트 `AGENTS.md`.

## Overview
프로젝트에 필요한 임베딩 및 LLM 기능 구축

## Setup / commands

- **Python 3.10+.** `pyproject.toml` 의 `requires-python = ">=3.10"` 이 장치다 — 3.9 면 pip 이
  설치를 거부한다. 하한이 3.10 인 것은 의존성 최대 요구치가 `>=3.10` 이고 코드도 거기까지만
  쓰기 때문. 올릴 때는 `[tool.ruff] target-version` 도 같이 올린다. 환경 종류(conda/venv)는 자유.
- **의존성은 `pyproject.toml` 한 곳.** `requirements.txt` 를 다시 만들지 말 것 — 두 벌이던 때
  한쪽에만 추가되어 둘 다 설치해야 돌았다. 설치는 `pip install -e ".[dev]"` (`Ctrl+Shift+B`).
  `-e` 를 빼면 `app/`·`pipeline/` 이 sys.path 에 안 올라간다.

## Code style
디자인패턴을 준수하고, 파일에서 정해진 역할외에 의존성을 어기지않는 코드 설계를 한다.
함수 인자값에는 자료형을 명시하고 (doc : str), 핵심 주석을 간단 명료하게 작성한다.
코드 네이밍을 규격화하고 모두가 읽기 편한 방식으로 구조를 설계한다.

### 함수 docstring

공개 함수는 아래 절을 이 순서로 쓴다. 한 줄짜리 요약 docstring 으로 대신하지 않는다.

```python
def refs(data: dict[str, list[dict]]) -> list[Ref]:
    """
    # summary
    런타임 테이블이 마스터와 자기들끼리 무엇을 가리키는지 모은다.

    # params
    data: read_all 결과. MASTER_TABLES 도 들어 있어야 한다<br>

    # returns
    Ref 목록. 가리키는 대상이 없는 테이블은 빠져서 길이가 TABLES 보다 짧다

    # examples
        check_refs(refs(data))  -> 자연키 전부 해석됨
    """
```

- **`# params` 는 인자 하나가 끝날 때마다 줄 끝에 `<br>` 을 붙인다.** 마지막 인자도 붙인다.
  안 붙이면 문서로 렌더링할 때 여러 인자가 한 줄로 이어 붙는다.
- 인자가 없으면 `없다. 옵션은 argv 에서 읽는다 — --check` 처럼 어디서 읽는지 적는다. 이 줄에도 `<br>` 을 붙인다.
- **`# returns` 는 반환값이 있을 때만 쓴다.** `-> None` 이면 절 자체를 넣지 않는다.
  타입 힌트가 모양을 알려주므로 여기에는 **의미**를 적는다 — 크기·순서·빈 경우
  (`없으면 빈 리스트`, `부모가 앞에 온다`, `이미 있던 것은 빠진다`).
- `# examples` 는 4칸 들여쓰고, 반환이 있으면 `-> 결과` 로 무엇이 나오는지 같이 적는다.
  `# returns` 가 규칙이라면 여기는 실례다. 둘 다 쓴다.
- 각 절 사이는 빈 줄 하나로 띄운다.
- 절 제목(`# summary` 등)은 영어, 내용은 한국어로 쓴다.

## Testing instructions

데이터 정합성을 검사하며, 사용자 쿼리에 따른 응답의 질을 높히는 것을 목표로한다.
청킹과 임베드 품질 향상에 중점을 두어 테스트를 통해 개선한다.

## Commit / PR guidelines

사용자가 직접 git 에 접근하며, Agent는 Commit, Push는 하지않는다.

## Architecture

```
app/
├── core/           # 설정, DB 연결, 서비스 토큰 검증 (공통 인프라)
├── models/         # SQLAlchemy 테이블 정의. farm/ 은 Next.js 와 공유하는 테이블
├── domain/         # 프레임워크 무관 순수 로직 (적합도·GDD·가드레일·대화 맥락)
├── service/        # 쿼리와 domain 을 합쳐 api 로 올린다
├── knowledge/      # RAG 런타임 (청킹 · 임베딩 · 벡터/키워드 검색 · 생성)
├── graph/          # LangGraph 오케스트레이션 (state, node, edge)
├── api/, schemas/  # FastAPI 엔드포인트 + 요청/응답 스키마
└── main.py         # FastAPI 앱 진입점

pipeline/           # 오프라인 배치 스크립트 (load → chunk → embed 순 CLI)
tests/              # pytest
```

호출은 한 방향: `api → service → (repo, domain)`.
`repo` 는 쿼리만, `domain` 은 가공만 한다. 둘을 합치는 코드는 `service` 에만 둔다.
`graph/` 는 독립된 층이 아니라 service 가 쓰는 수단 중 하나다.

- **쿼리는 `repo/` 에만 쓴다.** `api/` · `service/` 에서 `db.query(...)` 를 직접
  부르지 않는다. 예외는 `knowledge/`(pgvector 세션 상태)와 `core/db.py` 뿐이고,
  `tests/test_queries_live_in_repo.py` 가 이를 검사한다.
- `graph/` 는 환경변수를 읽지 않는다. DB 세션·LLM 같은 외부 의존은 state 나 인자로 받는다.
- 점수 로직(`domain/suitability.py`)은 프론트에도 한 벌 더 있다. 정본 미정.

### 결정을 미룬 규칙은 `_{n}` 으로 둔다

근거가 없을 때 억지로 하나를 고르지 않는다. 같은 모양의 함수를 `_1`·`_2` 로 두고
모듈 상수 한 줄(`SCORE_RULE`, `HISTORY_RULE`)로 갈아 끼운다.
자세한 규칙은 `docs/CONVENTIONS.md` §5.

## Logging
