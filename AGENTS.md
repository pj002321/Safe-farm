# Safe Farm AI

기상 · 위성 데이터로 농작물 위험을 감지하고 LLM으로 대응을 추천하는 서비스.
웹은 Next.js 16(App Router) + Supabase(Auth · Postgres · RLS), AI 코어(LangGraph · 임베딩 ·
벡터 검색)는 `ai-service/`에 Python(FastAPI)으로 둔다. ai-service 규칙은 `ai-service/AGENTS.md`.

## 브랜치 전략

```
feature/* → development → production
```

- 모든 작업은 `development`에서 딴 `feature/작업명` 브랜치로 한다.
- 끝나면 `development`에 머지하고, feature 브랜치 삭제 여부를 확인한다.
- `development` 검증이 끝나면 `production`으로 머지해 운영 배포한다.
- `development` / `production`에 직접 커밋하지 않는다.

## 인프라

| 구성 | 위치 |
|---|---|
| 웹 (Next.js) | Railway, 루트 `Dockerfile`, 공개 도메인 |
| AI 서버 (FastAPI) | Railway, `ai-service/Dockerfile`, **내부망 전용** |
| DB · Auth · 배치 | Supabase 서울 리전, 스키마는 `supabase/migrations/` |

- `SUPABASE_SERVICE_ROLE` 키와 `AI_SERVICE_TOKEN`은 **저장소에 넣지 않는다.** 로컬은
  `.env.local`, 배포는 Railway 환경변수에만 둔다. 추적되는 `.env`에는 키 이름만 적는다.
- ai-service에는 공개 도메인을 붙이지 않는다. LLM을 호출하므로 열면 남이 요금을 쓴다.
  Next → ai-service 호출은 Railway 내부망(`http://…railway.internal`) + `AI_SERVICE_TOKEN`.
  자세한 규약은 `docs/architecture/service-communication.md`.

## 아키텍처 규칙

- `src/app/`은 **라우팅 전용**. 로직은 `src/features/<도메인>/`에 둔다. 수직 분할.
- 의존성은 단방향: `shared → features → app`. features끼리 import 금지.
- Supabase 클라이언트는 `src/shared/supabase/` 한 곳에서만 만든다.
  - `client.ts` — 브라우저용. 로그인 · 가입에만 쓰고 **권한 판단에 쓰지 않는다.**
  - `server.ts` — `getSupabaseServer()`는 사용자 세션으로 질의해 RLS가 걸린다(기본값).
    `getSupabaseAdmin()`은 **RLS를 우회**한다. 사용자 권한으로 못 하는 일에만 쓴다.
    `server-only`라 클라이언트 번들에 섞이면 빌드가 깨진다 — 이 import를 지우지 말 것.
- 서버의 인가 판단은 `getUser()`로 한다. `getSession()`은 쿠키를 그대로 믿으므로 근거가 못 된다.
- **`src/proxy.ts`를 지우지 말 것.** Supabase 토큰 갱신과 경로 분기를 맡는다. 지우면
  사용자가 무작위로 로그아웃된다. **`config.matcher`의 정적 확장자 목록도 지우지 말 것.**
  빠뜨리면 `public/` 에셋이 `/login`으로 리다이렉트되어 `Unexpected token '<'`로 죽는다.
- 역할은 JWT의 **`app_metadata.role`**에서 읽는다(`shared/auth/session.ts`). 사용자가 쓸 수
  있는 `profiles` 컬럼은 권한 판단에 쓰지 않는다. 부여 · 회수는 `npm run role`로만 한다.
- `'use server'` 파일은 **export 하나가 곧 공개 POST 엔드포인트**다. 헬퍼를 같이 export하지
  말고, 모든 액션 첫 줄에서 `requireUser()` / `requireAdmin()`을 부른다. 페이지 · 레이아웃의
  검사는 액션에 미치지 않는다. Route Handler(`src/app/api/`)도 같은 규칙이다.
- **스키마와 RLS 정책은 한 마이그레이션으로 바꾼다.** 테이블을 추가하면 `enable row level
  security`와 정책을 같은 파일에 넣는다. RLS 없는 테이블은 anon 키로 누구나 읽는다.
- 테스트는 `domain/` 순수 함수에만 쓴다. async Server Component는 Vitest 공식 미지원.
- 스타일은 `src/app/globals.css`의 시맨틱 토큰만 쓴다(`text-fg`, `bg-surface`, `text-accent`).

## 커밋 규칙

```
<태그>: <무엇을 왜 바꿨는지>
```

| 태그 | 사용 시점 |
|---|---|
| `feature` | 새 기능 추가 |
| `update` | 기존 기능 변경 |
| `fixed` | 오류 수정 · 리팩토링 |
| `chore` | 라이브러리 · 버전 · 도구 |
| `wip` | 작업 중 일시 중단 |
| `broken` | 빌드가 깨진 상태 — **이 커밋이 있는 브랜치는 pull · 머지 금지** |

- `wip` / `broken`은 `feature/*`에서만 쓴다. 빌드가 복구되면 `fixed`로 이어서 커밋한다.
- 한 커밋은 한 가지 이유로만 바꾼다. 본문에는 **왜**를 적는다.
- 머지 전에 `npm run typecheck && npm test && npm run build`를 실제로 돌린다.

## 명령

```bash
npm run dev        # localhost:3000
npm test           # vitest
npm run typecheck  # tsc --noEmit
npm run lint       # biome
npm run build
npm run role -- grant|revoke|list <email>   # 관리자 역할
```

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
