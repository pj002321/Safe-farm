# AI 질의응답 구현 계획 (V1-71 ~ V1-85)

FEATURE_SPEC.md 의 F9 는 "전부 TODO 스텁"이라 적혀 있지만 실제로는 다르다 —
`knowledge/{chunker,embedder,vector_store,retriever}.py` 는 이미 동작하는
코드다. 비어 있는 건 그 위에 얹을 API·그래프·정책 쪽이다. 아래는 실제 코드를
읽고 확인한 현재 상태다.

## 지금 있는 것 (재사용)

| 모듈 | 역할 | 상태 |
|---|---|---|
| `knowledge/chunker.py` | 문서 → 조각. 한국어 종결어미 기준 분할 | 완성 |
| `knowledge/embedder.py` | 텍스트 → 벡터 (OpenAI `text-embedding-3-small`) | 완성 |
| `knowledge/vector_store.py` | pgvector 저장·코사인 검색 (`search_with_score`) | 완성 |
| `knowledge/retriever.py` | 질문 → top-k 조각 (`retrieve_with_score`) | 완성 |
| `models/{document,chunk}.py` | 문서·조각 테이블. `document.meta` 에 JSONB 메타 있음 | 완성 |
| `pipeline/doc/sources.py` | 임베딩 대상 쿼리. 현재 소스는 `crop_stage` 하나뿐 | **재배매뉴얼·주간농사정보 소스 없음** |
| `core/security.py` | `AI_SERVICE_TOKEN` — Next 서버만 호출 가능 | 완성 (사용자 인증은 아님) |
| `graph/graph.py` | LangGraph 조립 틀. RAG 그래프(`build_graph_default`)는 **주석 처리됨** | 뼈대만 |
| `api/ask.py` | 엔드포인트 | **비어 있음** |

## 빠진 것 — 항목별

| ID | 항목 | 필요 작업 | 의존 |
|---|---|---|---|
| V1-71 | 질문 입력 (500자) | `api/ask.py` 에 `POST /ask` + `schemas/ask.py` (요청 500자 검증) | 없음 |
| V1-73 | 하이브리드 검색(RAG) | `retriever.py` 에 메타 필터 인자 추가 (`document.meta` 의 `variant_id`/`stage_order`로 사전 필터) + `sources.py` 에 재배매뉴얼·주간농사정보 소스 추가 | 문서 소스 자체가 크롭 단계 가이드 하나뿐 — **콘텐츠 확보가 먼저** |
| V1-74 | 리랭킹 | top-k 재정렬 단계 추가 (cross-encoder 또는 LLM 재채점) | V1-73 |
| V1-72 | 개인 컨텍스트 주입 | 작물/생육단계/지역/최근기상 — `features/growth`, `features/monitoring` (Next 쪽) 데이터를 요청 payload 로 ai-service 에 넘길지, ai-service 가 Supabase 를 직접 조회할지 **결정 필요** | V1-71 |
| V1-75 | 출처 표시 | `Chunk.document_id` → `Document.title`/`source` 조인해 응답에 포함 | V1-73 |
| V1-76 | 스트리밍 | FastAPI `StreamingResponse` + LangChain `.astream()` | V1-71, graph 완성 후 |
| V1-77 | 금지 주제 가드레일 | 농약 희석배수·살포량 질의 차단 — system prompt 지침만으론 불충분, 키워드/패턴 사전 필터 + "등록 기준 확인 경로 안내" 고정 응답 | V1-71 |
| V1-78 | 근거 부족 응답 | `search_with_score` 의 거리값에 임계값 적용 (코사인 거리 0~2, 낮을수록 유사) — 임계값 자체가 **결정 필요**(실측 없음) | V1-73 |
| V1-79 | 진단 확정 금지 | system prompt 에 "복수 가능성 + 확신도, 단정 표현 금지" 명시. V1-80(사진 진단) 없이도 텍스트 답변에 우선 적용 가능 | V1-72 |
| V1-80 | 이미지 업로드 진단 | 별도 파이프라인 — Vision 모델 호출 + "지역 병해충 발생정보" 참조라는데 **그 데이터 출처가 DOMAIN_REF 에 없음** (FEATURE_SPEC.md 부록: "사진 병해충 판별 — 우리 라벨 데이터 없음"과 충돌, 재확인 필요) | 신규 |
| V1-81 | 대화 이력 저장 | 신규 테이블(`conversations`/`messages`) 또는 `graph.py` 의 `checkpointer` 그대로 활용(이미 멀티턴 지원 구조 있음, `create_checkpoint_serde` 참고) | V1-71 |
| V1-82 | 추천 질문 3건 | 생육단계 기준 — LLM 불필요, `growth/monitoring` 도메인 값으로 규칙 기반 템플릿이면 충분 (F2 의 `growthReport.ts` 방식과 동일) | V1-72 데이터 |
| V1-83 | 답변 피드백 | 신규 테이블(도움됨/안됨 + 사유) | V1-81 (메시지 단위로 달림) |
| V1-84 | 사용량 제한 | **표 값(일 5회)과 설명 텍스트(일반 회원 일 10회)가 다름 — 먼저 확인.** 사용자 식별이 필요하므로 Next 서버가 세션에서 viewer.id 를 붙여 ai-service 에 넘기는 구조 필요 (ai-service 는 서비스 토큰만 검증, 사용자 인증 없음) | V1-71 |
| V1-85 | 민감정보 마스킹 | [`docs/architecture/pii-masking.md`](../../docs/architecture/pii-masking.md) 참고 | V1-72, V1-81 |

## 권장 순서

```
1. V1-71 (엔드포인트) ─┬→ V1-73 (검색, 문서 소스 확보 먼저)
                       │      └→ V1-74 리랭킹, V1-75 출처, V1-78 근거부족
                       ├→ V1-77 가드레일 (독립적으로 먼저 넣어도 됨)
                       └→ V1-72 컨텍스트 주입 → V1-79 진단확정금지, V1-82 추천질문
2. V1-81 대화 이력 (checkpointer 재사용 검토)
3. V1-76 스트리밍, V1-83 피드백, V1-84 사용량 제한
4. V1-80 사진 진단 (데이터 출처 재확인 후 별도 착수)
5. V1-85 마스킹은 V1-72/81 이 구체화되는 시점에 같이 끼워 넣는다
```

## 먼저 답 정해야 할 것

- V1-73/80: 재배매뉴얼·주간농사정보, 지역 병해충 발생정보 — 실제 텍스트/데이터 출처가 아직 없다.
- V1-72: 개인 컨텍스트를 Next 가 조립해 넘길지, ai-service 가 직접 Supabase 를 볼지.
- V1-78: 근거 부족 판정 임계값(코사인 거리).
- V1-84: 일 5회 vs 10회 — 스펙 표 자체의 모순.
