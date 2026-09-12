# AGENTS.md

<!-- agents.md 공개 스펙 파일. Claude Code 외 다른 AI 코딩 도구(Cursor, Codex, Aider, Gemini CLI 등)도 이 파일을 읽는다.
     이 저장소에서는 "도구 무관 공통 지침"만 여기 쓰고, Claude Code 전용 사항은 CLAUDE.md에 남긴다.
     (지금 CLAUDE.md 는 `@AGENTS.md` 한 줄짜리 포인터다.) -->

작물 추천 · 질의응답 AI 서버. Python 3.10+ · LangGraph.
설치·명령은 `README.md`, 설계 배경과 미결정 사항은 `archi_base.md`.
레포 전체 규칙(브랜치 · Supabase)은 루트 `AGENTS.md`.

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

## Testing instructions

데이터 정합성을 검사하며, 사용자 쿼리에 따른 응답의 질을 높히는 것을 목표로한다.
청킹과 임베드 품질 향상에 중점을 두어 테스트를 통해 개선한다.

## Commit / PR guidelines

사용자가 직접 git 에 접근하며, Agent는 Commit, Push는 하지않는다.

## Architecture

| 위치 | 하는 일 |
|---|---|
| `app/core/` | 설정 · DB 연결 (공통 인프라) |
| `app/models/` | SQLAlchemy 테이블 정의 (Document, Chunk) |
| `app/repo/` | DB 쿼리. 가공하지 않고 값만 넘긴다 |
| `app/domain/` | 프레임워크 무관 순수 로직 (작물 적합도 판정 등) |
| `app/service/` | repo 와 domain 이 만나는 지점. 둘을 호출해 합친 결과를 `app/api/` 로 올린다 |
| `app/knowledge/` | RAG 런타임 — chunk 분리 · 임베딩 호출 · 벡터 저장/검색 |
| `app/graph/` | LangGraph 오케스트레이션 (state · node · edge) |
| `app/api/` · `app/schemas/` | FastAPI 엔드포인트 + 요청/응답 스키마 |
| `app/main.py` | FastAPI 앱 진입점 |
| `pipeline/` | 오프라인 배치 CLI (load → chunk → embed 순) |
| `tests/` | pytest. `domain/` 순수 함수와 `graph/` 의 `route_*`·노드 단위만 |

호출은 한 방향: `api → service → (repo, domain)`.
`repo` 는 쿼리만, `domain` 은 가공만 한다. 둘을 합치는 코드는 `service` 에만 둔다.
`graph/` 는 독립된 층이 아니라 service 가 쓰는 수단 중 하나다.

- `graph/` 는 환경변수를 읽지 않는다. 기상 API·후보 조회·LLM 은 `GraphDeps` 로,
  checkpointer 는 인자로 받는다 — `create_graph(deps, checkpointer=...)`.
- 점수 로직은 프론트에도 한 벌 더 있다. 정본 미정.
- checkpointer 에는 `serde=create_checkpoint_serde()` 를 같이 넘긴다. 안 넘기면 도메인 dataclass 가
  복원 때 조용히 `dict` 가 된다. state 에 새 dataclass 를 넣으면 `CHECKPOINT_TYPES` 에도 추가.

### 아직 빈 파일 (0줄)

`app/api/` · `app/schemas/` · `app/models/` · `app/repo/` · `app/service/` · `app/ai/` ·
`pipeline/` 전부.
내용이 있는 건 `app/domain/` · `app/graph/` · `app/knowledge/` · `app/core/` · `app/main.py`.

## Logging
