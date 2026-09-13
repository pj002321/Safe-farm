# Safe Farm AI

농작물 상태와 날씨를 읽어 재배 적합도를 추천하는 서비스.
Next.js 16(App Router) + Firebase(Auth/Firestore/Storage).

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

Firebase 프로젝트를 쓴다. Firestore 리전은 **asia-northeast3 (서울)**.
**리전은 생성 후 변경할 수 없다** — 잘못 고르면 프로젝트를 새로 만드는 수밖에 없다.
`development` / `production` 은 Firebase 프로젝트를 각각 둔다. 데이터·사용자·보안
규칙이 프로젝트 단위로 격리되므로 브랜치 기능 같은 건 없다.

서비스 계정 키(`FIREBASE_SERVICE_ACCOUNT`)는 **저장소에 넣지 않는다.** 로컬은
`.env.local`, 배포는 Vercel 환경변수에만 둔다. 이 키 하나가 프로젝트 전체 권한이다.


## 아키텍처 규칙

- `src/app/`은 **라우팅 전용**. 로직은 `src/features/<도메인>/`에 둔다. MVC 아님 — 수직 분할.
- 의존성은 단방향: `shared → features → app`. features끼리 import 금지.
- Firebase SDK 는 2종. 섞지 말 것:
  `shared/firebase/client.ts`(브라우저 SDK) · `shared/firebase/admin.ts`(Admin SDK, 서버 전용).
  설정 값은 `shared/firebase/config.ts` 가 한 곳에서 읽는다.
- **`admin.ts` 를 클라이언트에서 import 하지 말 것.** 번들에 섞이면 서비스 계정이
  그대로 브라우저로 나간다. Admin SDK 는 보안 규칙을 통째로 우회하므로 이건 곧
  프로젝트 전체 탈취다. Client Component 의 import 그래프에 admin 이 들어오는지
  항상 확인한다. 서버 전용 코드에서만 부른다(Route Handler · Server Component ·
  Server Action · proxy).
- **Firebase Auth 는 비밀번호를 서버에서 검증할 수 없다.** `signInWithEmailAndPassword`
  는 클라이언트 SDK 에만 있다. 그래서 로그인·가입은 브라우저에서 일어나고, JS 없이
  동작하는 폼은 성립하지 않는다. 플랫폼 제약이지 설계 선택이 아니다. 흐름:
  브라우저 로그인 → `getIdToken()` → `POST /api/auth/session` → 서버가
  `verifyIdToken()` 후 `createSessionCookie()` 로 httpOnly `__session` 쿠키를 심는다.
  **보호는 전부 서버의 세션 쿠키 검증이 한다** — 클라이언트가 보낸 상태는 신뢰하지 않는다.
- **`src/proxy.ts` 를 지우지 말 것.** 역할은 **세션 쿠키 검증과 경로 분기**다
  (토큰 갱신이 아니다 — 갱신은 클라이언트 SDK 가 알아서 한다).
  **`config.matcher` 의 정적 확장자 목록도 지우지 말 것.** 빠뜨리면 `public/` 의
  에셋이 미들웨어를 타고, 세션이 없어 `/login` 으로 리다이렉트된다. 브라우저는 JS 를
  기대한 자리에서 HTML 을 받아 `Unexpected token '<'` 로 죽는다.
- 역할은 Firebase **custom claims** 의 `role` 에서 읽는다. custom claim 은 Admin SDK
  로만 설정되므로 사용자가 고칠 수 없다. **클라이언트가 쓸 수 있는 Firestore 문서
  필드는 권한 판단에 쓰지 않는다.**
- `'use server'` 파일은 **export 하나가 곧 공개 POST 엔드포인트**다. 헬퍼를 같이
  export하지 말고, 모든 액션 첫 줄에서 `requireUser()` / `requireAdmin()` 을 부른다.
  페이지·레이아웃의 검사는 액션에 미치지 않는다.
  인증 자체(세션 쿠키 발급·파기)는 Server Action 이 아니라 Route Handler
  `/api/auth/session` 이 담당한다 — 같은 검사 규칙이 그대로 적용된다.
- **Firestore 보안 규칙(`firestore.rules`)은 스키마와 한 단위로 바꾼다.** 컬렉션을
  추가하면 규칙도 같은 커밋에 추가하고 배포한다.
  - 규칙 파일 맨 아래의 catch-all 거부를 빼먹지 말 것:
    `match /{document=**} { allow read, write: if false; }`
    없으면 컬렉션을 새로 만드는 순간 그 컬렉션이 기본 공개가 된다.
  - **테스트 모드로 만든 DB 는 30일 뒤 전체 공개 상태로 남는다.** 콘솔에서 만들고
    규칙을 올리지 않으면 만료일에 조용히 열린다. 프로젝트를 만들면 규칙부터 배포한다.
  - Admin SDK 는 규칙을 우회한다. 서버 코드의 권한 검사는 규칙이 아니라 코드가 한다.
- 테스트는 `domain/` 순수 함수에만 쓴다. async Server Component는 Vitest 공식 미지원.
- 스타일은 `src/app/globals.css`의 시맨틱 토큰만 사용한다(`text-fg`, `bg-surface`, `text-accent`).


## 형상 관리 규칙

### 커밋 메시지 태그

```
<태그>: <무엇을 왜 바꿨는지>
```

| 태그 | 사용 시점 |
|---|---|
| `feature` | 신규 기능·구현 부분이 추가될 때 |
| `update` | 기존에 구현된 기능을 업데이트할 때 |
| `fixed` | 오류 및 일반화, 리팩토링 작업 등 분류의 수정 |
| `chore` | 새로운 라이브러리, 버전 추가·수정, 도구 구축 |
| `wip` | 작업 중인 상태를 알림 (여행·약속 등으로 일시 중단) |
| `broken` | **외부에서 절대 받으면 안 되는 커밋** (오류 수정 중이라 빌드 불가) |

**`broken` 은 경고 표식이다.** 이 태그가 붙은 커밋이 있는 브랜치는 다른 사람이
pull 하거나 머지하지 않는다. 빌드가 복구되면 `fixed` 로 이어서 커밋한다.

`wip` 과 `broken` 은 `feature/*` 브랜치 안에서만 쓴다. `development` / `production`
에는 올라가지 않는다.

### 커밋 단위

- 한 커밋은 한 가지 이유로만 바꾼다. 기능 추가와 리팩토링을 섞지 않는다.
- 메시지 본문에 **왜** 바꿨는지를 적는다. 무엇을 바꿨는지는 diff 가 말해준다.
- 머지 전에 `npm run typecheck && npm test && npm run build` 를 실제로 돌린다.

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
