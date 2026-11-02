# 보강 작업 계획

이 파일 하나만 보고 작업에 들어간다. 규칙은 루트 `AGENTS.md`, `ai-service/AGENTS.md`,
`ai-service/docs/CONVENTIONS.md` 가 우선이고, 이 문서와 충돌하면 그쪽을 따른다.

목표 직무: AI 에이전트 엔지니어(주) · AI 데이터 엔지니어(보조).
공고 키워드 중 이력서에 근거가 없는 것(CI/CD, MCP, Graph RAG, 데이터 품질)을 실제로
구현하고, 전후를 숫자로 남긴다.

## 진행 상태 (2026-10-16 코드로 확인)

| 순서 | 작업 | 상태 |
|---|---|---|
| 1 | CI — GitHub Actions | 미착수 (`.github/` 없음) |
| 2 | MCP 서버 | 미착수 (`mcp`/`fastmcp` import 없음) |
| 3 | Graph RAG | 미착수 (`graph_retrieve`·그래프 저장소 없음) |
| 4 | 파이프라인 품질 검사 | 미착수 |

다시 만들지 말 것: Agentic RAG 그래프(`app/graph/`), 도구 `get_plot_context`(`app/tools/tools.py`),
검색·리랭커(`app/knowledge/`), 가드레일(`app/domain/guardrail.py`), Golden Set
(`data/golden/ask.csv`, 43문항), 채점(`py -m pipeline.doc.golden`, `app/domain/retrieval_eval.py`),
병해충 데이터·사전(`app/models/farm/pest.py`, `app/domain/pest_names.py`, `app/domain/symptoms.py`),
공공 데이터 적재(`pipeline/`, `supabase/migrations/`).

## 공통 규칙

- 브랜치: `development` 에서 `feature/<작업명>`. 머지 전 `npm run typecheck && npm test && npm run build`.
- 커밋: `<태그>: <무엇을 왜>` (feature · update · fixed · chore). 기능 1개 = 커밋 1개.
- 비밀값은 커밋하지 않는다. 새 환경변수는 `.env` 에 **이름만**.
- 손대기 전에 기준선부터 잰다. 같은 평가셋·필터·조건으로 전후를 잰다.
- 표본이 작으면 부트스트랩 신뢰구간을 같이 적는다. 구간이 겹치면 "동률".
- 나빠진 결과도 지우지 않고 이유와 함께 남긴다.
- 요금이 드는 검사(LLM · 유료 임베딩)는 CI에 넣지 않는다. 수동 명령으로 둔다.
- README 의 결과는 이미지(그래프·도식)로 넣는다. ASCII 도표 금지.

## 1. CI — GitHub Actions

- `.github/workflows/ci.yml`. 트리거: PR, `development`·`production` push.
- job `ai-service`: Python 3.10(`pyproject` 하한), `pip install -e ".[dev]"`, `ruff check`, `pytest`.
- job `web`: Node LTS, `npm ci`, `npm run lint`, `npm test`, `npm run build`.
- DB·외부 API·LLM 이 필요한 테스트는 마커(`@pytest.mark.live`)로 나누고 CI에서 뺀다.
  `tests/test_queries_live_in_repo.py` 부터 확인.
- Railway 가 GitHub 연동이면 "Wait for CI" 를 켠다(직접 못 하면 방법을 README에).
- README 상단에 CI 배지.
- 완료: PR에서 두 job 초록, CI에서 돈 테스트 수 기록.

## 2. MCP 서버

- `ai-service/mcp_server/` 에 FastMCP stdio 서버. 의존성은 `pyproject` 선택 그룹 `[mcp]`.
- 읽기 전용 도구만. 기존 함수를 부르기만 하고 로직을 복제하지 않는다.
  - `get_plot_context(plot_id)` — 기존 도구와 같은 결과
  - `get_weather(region | lat,lon)` — 최근 관측 · 예보 · 특보
  - `search_farm_docs(question, k)` — 기존 retriever + 가드레일
  - (선택) `get_pest_alerts(crop)`
- MCP 경로에도 `is_blocked_topic` 을 반드시 적용한다. 쓰기 도구 없음.
- README 에 Claude Desktop / Claude Code 연결 설정(`mcp.json`)과 실행법.
- 도구별 pytest(DB 필요 시 기존 픽스처 방식).
- 완료: Inspector 또는 Claude Code 에서 목록·호출 성공, 가드레일 문항 차단, 스크린샷을 `docs/` 에.

## 3. Graph RAG — 작물 · 병해충 · 증상 · 방제

**기준선 먼저.** `ask.csv` 의 병해충·증상·방제 문항 수를 센다. 15개 미만이면 20~30개 추가
(증상→병명, 병명→방제, 작물→주의 병해충, 다단계). 정답 출처를 같이 적는다.
현재 경로로 이 부분집합의 recall · MRR 을 잰다.

- 스키마: `Crop`, `Pest`(병·해충·바이러스), `Symptom`, `Control`(방제법·약제), `Alert`(경보 회차).
  `Crop-AFFECTED_BY->Pest`, `Pest-SHOWS->Symptom`, `Pest-CONTROLLED_BY->Control`, `Alert-WARNS->Pest`.
- 저장소: `GraphStore` 인터페이스 뒤. 새 인프라 부담 때문에 **Postgres 간선 테이블을 먼저**
  구현하고(마이그레이션에 RLS·grant 포함), 결정 이유를 기록. Neo4j 는 그다음.
- 적재: `pipeline/graph/` 에서 `pest_alerts` · `pest_bulletins` · 병해충 사전 · NCPMS 문서로 추출.
  규칙 기반 우선, LLM 추출을 쓰면 검수용 CSV 를 남긴다.
- LangGraph: plan 이 병해충 질문이라 판단하면 `graph_retrieve`(서브그래프 → 텍스트)를 타고
  벡터 결과와 합쳐 generate 로(Hybrid).
- 금지 약제를 `Control.banned=true` 로도 표현해 답변 전 이중 차단.
- 테스트: 추출 규칙, 질의 빌더, 라우팅 분기.
- 완료: 병해충 부분집합에서 벡터 단독 vs Hybrid 의 적중률 · MRR 비교표(신뢰구간), 스키마 도식을 README에.

## 4. 파이프라인 품질 검사

- `pipeline/` 적재 단계마다: 결측률, 범위(기온 −40~50 등), 관측소 누락, 중복 키, 전일 대비 행 수 급변.
- 결과를 테이블(또는 ops_log)에 남기고 관리자 운영 상태에 노출(`app/domain/ops_status.py`).
- 흐름도(소스 4종 → 적재 → 검사 → GDD · 오늘 할 일) 이미지를 README에.
- 완료: 검사 항목 목록, 최근 7일 결과 요약, 이상 데이터를 실제로 잡은 사례 1건 이상.

## 결과 기록 양식

작업이 끝나면 이 파일 아래에 붙인다.

```
## <작업 이름> — YYYY-MM-DD
- 왜:
- 무엇을: (핵심 파일 경로)
- 측정: 기준선 → 결과 (평가셋, 표본 수, 모델, 신뢰구간)
- 남은 것:
- 이력서 한 줄: A였던 것을, B로 바꿔 → **결과**
```

이력서에는 구현하고 숫자가 나온 것만 넣는다.
