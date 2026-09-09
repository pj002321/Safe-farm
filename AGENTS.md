# Safe Farm AI

농작물 상태와 날씨를 읽어 재배 적합도를 추천하는 서비스.
Next.js(App Router) + InsForge(DB/auth/storage/realtime) + LangGraph.js.

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

### ⚠️ 인프라 제약 (확인됨)

InsForge Sites는 **프리뷰/스테이징 배포를 지원하지 않는다** — 배포 API가 `target: 'production'`으로
하드코딩되어 있다. 따라서 `development`와 `production`을 분리하려면 **InsForge 프로젝트를 2개**
두어야 한다(백엔드 `branch create`는 프론트 배포에 적용되지 않는다).

롤백도 이전 소스를 다시 배포하는 방법뿐이므로, `production` 머지 전에 `development`에서
반드시 검증한다.

## 아키텍처 규칙

- `src/app/`은 **라우팅 전용**. 로직은 `src/features/<도메인>/`에 둔다. MVC 아님 — 수직 분할.
- 의존성은 단방향: `shared → features → app`. features끼리 import 금지.
- **데이터 조회 기본 경로는 브라우저 → InsForge 직결**(`features/*/api.ts`, anon + RLS).
  Next 서버 코드는 비밀이 필요할 때만 만든다. 이유: Vercel 함수(iad1)와
  InsForge(ap-southeast) 리전이 달라 SSR로 DB를 치면 대륙 왕복이 붙는다.
- `'use server'` 파일은 **export 하나가 곧 공개 POST 엔드포인트**다. 헬퍼를 같이 export하지 말고,
  모든 액션 첫 줄에서 세션·소유권을 다시 확인한다. 페이지/레이아웃의 권한 검사는 액션에 미치지 않는다.
- 테스트는 `domain/` 순수 함수와 LangGraph conditional edge에만 쓴다.
  async Server Component는 Vitest 공식 미지원.
- 스타일은 `src/app/globals.css`의 시맨틱 토큰만 사용한다(`text-fg`, `bg-surface`, `text-accent`).
  원시 팔레트(`--leaf-*`)를 직접 쓰면 다크모드가 깨진다.

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
