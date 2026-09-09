# Safe Farm AI

농작물 상태와 날씨를 읽어 재배 적합도를 추천하는 서비스.
Next.js 16(App Router) + Supabase(Postgres/auth/storage/realtime).

## 브랜치 전략

### 흐름

```
feature/* → development → production
```

### 규칙

1. **개인 작업 단위**
   - 모든 작업은 `feature/작업명` 브랜치로 진행한다.
   - `feature/*`는 **`development` 기준**으로 생성한다.

2. **승격**
   - 작업이 끝나면 `feature/작업명`을 `development`에 머지한다.
   - 머지 후 해당 feature 브랜치는 삭제 여부를 확인한다.

3. **배포**
   - `development` 머지 → 개발 환경 반영.
   - 개발 환경 검증 완료 후 `development`를 `production`으로 머지 → 운영 배포.

4. **직접 커밋 금지**
   - `development`와 `production`에 직접 커밋하지 않는다. 항상 feature 브랜치를 거친다.

### 인프라

Supabase 프로젝트를 **Northeast Asia (Seoul) / ap-northeast-2** 에 만든다.
`development` / `production` 은 Supabase 프로젝트를 각각 두거나, 유료 플랜의
database branching 을 쓴다.


## 아키텍처 규칙

- `src/app/`은 **라우팅 전용**. 로직은 `src/features/<도메인>/`에 둔다. MVC 아님 — 수직 분할.
- 의존성은 단방향: `shared → features → app`. features끼리 import 금지.
- Supabase 클라이언트는 3종. 섞지 말 것:
  `shared/supabase/client.ts`(브라우저) · `server.ts`(서버, async) · `proxy.ts`(세션 갱신).
- **`src/proxy.ts` 를 지우지 말 것.** Server Component는 쿠키를 못 써서 여기서만
  토큰을 갱신할 수 있다. 없으면 사용자가 무작위로 로그아웃된다.
  `setAll` 의 두 번째 인자 `headers` 를 응답에 얹는 코드도 지우지 말 것 —
  빠뜨리면 인증 응답이 CDN에 캐시되어 세션이 샌다.
- 역할은 JWT `app_metadata.role` 에서 읽는다. **`user_metadata` 는 사용자가 고칠 수
  있으므로 권한 판단에 쓰지 않는다.**
- `'use server'` 파일은 **export 하나가 곧 공개 POST 엔드포인트**다. 헬퍼를 같이
  export하지 말고, 모든 액션 첫 줄에서 `requireUser()` / `requireAdmin()` 을 부른다.
  페이지·레이아웃의 검사는 액션에 미치지 않는다.
- **마이그레이션은 3종 세트를 한 단위로 쓴다: `grant` → `enable row level security`
  → `create policy`.** SQL 에디터·마이그레이션·MCP로 만든 테이블은 RLS가 자동으로
  켜지지 않는다. 로컬(`supabase start`)은 지금도 anon 자동 노출이 기본이라
  로컬만 되고 프로덕션에서 죽는 일이 흔하다.
- PostgREST 42501 에러가 주는 `GRANT ... TO anon` 힌트를 그대로 따르지 말 것.
  RLS가 꺼진 테이블에 실행하면 즉시 전체 공개된다.
- 테스트는 `domain/` 순수 함수에만 쓴다. async Server Component는 Vitest 공식 미지원.
- 스타일은 `src/app/globals.css`의 시맨틱 토큰만 사용한다(`text-fg`, `bg-surface`, `text-accent`).


## 명령

```bash
npm run dev        # localhost:3000
npm run test       # vitest
npm run typecheck  # tsc --noEmit
npm run lint       # biome
npm run build
```
<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
