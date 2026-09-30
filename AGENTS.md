# Safe Farm AI

기후,위성 데이터 기반으로 하는 농작물 위험 감지 및 개선 LLM 추천 서비스
Next.js 16(App Router) + Supabase(Auth · Postgres · pgvector).
AI 코어(LangGraph · 임베딩 · 벡터 검색)는 `ai-service/` 에 Python 으로 둔다.

## 브랜치 전략

```
feature/* → development → production
```

- 모든 작업은 `development`에서 딴 `feature/작업명` 브랜치로 한다.
- 끝나면 `development`에 머지하고, feature 브랜치 삭제 여부를 확인한다.
- `development` 검증이 끝나면 `production`으로 머지해 운영 배포한다.
- `development` / `production`에 직접 커밋하지 않는다.

## 인프라

2. **승격**
   - 작업이 끝나면 `feature/작업명`을 `development`에 머지한다.
   - 머지 후 해당 feature 브랜치는 삭제 여부를 확인한다.

3. **배포**
   - `development` 머지 → 개발 환경 반영.
   - 개발 환경 검증 완료 후 `development`를 `production`으로 머지 → 운영 배포.

4. **직접 커밋 금지**
   - `development`와 `production`에 직접 커밋하지 않는다. 항상 feature 브랜치를 거친다.

### 인프라

DB 는 Supabase(서울) 하나, 앱(Next · ai-service)은 Railway 에 둔다.
Next ↔ ai-service 통신 규약은 `docs/architecture/service-communication.md`.

- **ai-service 에 공개 도메인을 붙이지 않는다.** LLM 을 호출하므로 열면 남이 우리
  OpenAI 요금을 쓴다. 브라우저는 ai-service 를 직접 부르지 않고 항상 Next 서버를 거친다.
- `.env` 는 키 **이름**만 공유하는 템플릿이라 git 에 올라간다. **값을 넣지 않는다.**
  실제 값은 로컬 `.env.local`(gitignore), 배포는 Railway 환경변수에만 둔다.
- service role 키(`DB_SERVICE_ROLE`)는 RLS 를 통째로 우회한다. 이 키 하나가 DB 전체
  권한이다.

- `SUPABASE_SERVICE_ROLE` 키와 `AI_SERVICE_TOKEN`은 **저장소에 넣지 않는다.** 로컬은
  `.env.local`, 배포는 Railway 환경변수에만 둔다. 추적되는 `.env`에는 키 이름만 적는다.
- ai-service에는 공개 도메인을 붙이지 않는다. LLM을 호출하므로 열면 남이 요금을 쓴다.
  Next → ai-service 호출은 Railway 내부망(`http://…railway.internal`) + `AI_SERVICE_TOKEN`.
  자세한 규약은 `docs/architecture/service-communication.md`.

## 아키텍처 규칙

- `src/app/`은 **라우팅 전용**. 로직은 `src/features/<도메인>/`에 둔다. 수직 분할.
- 의존성은 단방향: `shared → features → app`. features끼리 import 금지.
- Supabase 클라이언트는 `shared/supabase/` 에 모여 있다. 섞지 말 것:
  `client.ts`(브라우저) · `server.ts`(서버 — `getSupabaseServer()` 는 사용자 권한,
  `getSupabaseAdmin()` 은 **RLS 우회**) · `proxy.ts`(proxy 전용).
  설정 값은 `shared/supabase/config.ts` 가 한 곳에서 읽는다.
- **서버 전용 모듈은 첫 줄에 `import "server-only"` 를 둔다.** Client Component 가
  import 하면 빌드가 막는다. `getSupabaseAdmin()` · service role 키가 번들에 섞이면
  DB 전체 권한이 브라우저로 나간다.
- **권한 판단은 서버의 `shared/auth/session.ts` 한 곳이 한다.** 클라이언트가 보낸 값은
  믿지 않는다.
  - **`getUser()` 를 쓴다. `getSession()` 을 쓰지 말 것.** `getSession()` 은 쿠키의
    JWT 를 검증 없이 디코드해서, 쿠키를 조작하면 아무 사용자나 될 수 있다.
  - 역할은 **`app_metadata.role`** 에서 읽는다. `user_metadata` 는 사용자가
    `updateUser()` 로 고칠 수 있어 권한 상승 경로가 된다. `profiles.role` 컬럼은
    표시용 사본이다.
  - 역할 부여·회수는 화면이 아니라 `npm run role` 스크립트로만 한다. 회수할 때는
    세션까지 지운다 — 안 지우면 토큰 수명 동안 권한이 남는다.
- **관리자는 Supabase 계정과 별개다.** `/admin/login` 에서 `ADMIN_PASSWORD` 를 맞히면
  서명된 httpOnly 쿠키(`admin_session`)를 받는다(`shared/auth/adminSession.ts`).
  페이지·레이아웃은 `requireAdminOrRedirect()`, 액션·Route Handler 는 `requireAdmin()`.
- **`src/proxy.ts` 를 지우지 말 것.** 역할은 ① Supabase 액세스 토큰 갱신 ② 경로 분기다.
  Server Component 는 쿠키를 쓸 수 없어 토큰을 갱신할 수 있는 곳이 여기뿐이다 —
  지우면 사용자가 무작위로 로그아웃된다. 리다이렉트는 `redirectKeepingCookies` 를
  탄다(`NextResponse.redirect()` 는 갱신 쿠키를 버려 무한 루프가 난다).
  **`config.matcher` 의 정적 확장자 목록도 지우지 말 것.** 빠뜨리면 `public/` 의
  에셋이 미들웨어를 타고, 세션이 없어 `/login` 으로 리다이렉트된다. 브라우저는 JS 를
  기대한 자리에서 HTML 을 받아 `Unexpected token '<'` 로 죽는다.
- `'use server'` 파일은 **export 하나가 곧 공개 POST 엔드포인트**다. 헬퍼를 같이
  export하지 말고, 모든 액션 첫 줄에서 `requireUser()` / `requireAdmin()` 을 부른다.
  페이지·레이아웃의 검사는 액션에 미치지 않는다. Route Handler 에도 같은 규칙이
  그대로 적용된다.
- **스키마 정본은 `supabase/migrations/*.sql` 이다.** 테이블을 추가하면 RLS 정책과
  grant 를 같은 마이그레이션에 넣는다. ai-service 의 `models/` 는 복사본이라 컬럼을
  더하면 둘 다 고친다.
  - service role(`getSupabaseAdmin()`)은 RLS 를 우회한다. 그 경로의 권한 검사는
    RLS 가 아니라 코드가 한다.
  - 조회에서 `deleted_at is null` 을 빠뜨리지 않는다 — 지운 밭이 되살아난다.
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
