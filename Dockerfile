# syntax=docker/dockerfile:1
#
# ─────────────────────────────────────────────────────────────
# Safe Farm AI — Cloud Run 실행 이미지
#
# 왜 정적 배포(firebase deploy 만)가 아니라 컨테이너인가:
#   이 앱은 서버가 있어야 돌아간다. 세션 쿠키를 굽는 Route Handler
#   (/api/auth/session), 요청 쿠키를 읽는 Server Component, 경로를 막는
#   proxy.ts, 그리고 서비스 계정 권한이 필요한 Admin SDK 가 전부 서버 쪽이다.
#   `output: "export"` 로 빌드하면 /login 에서 바로 깨진다.
#
# 서비스 계정 키는 이 이미지에 **들어가지 않는다**(.dockerignore 가 막는다).
#   Cloud Run 에서는 런타임 서비스 계정의 ADC 를 admin.ts 가 자동으로 쓴다.
#   admin.ts 는 secrets/firebase-adminsdk.json 이 없으면 applicationDefault()
#   로 넘어가게 이미 돼 있다 — 로컬은 파일, 배포는 ADC.
# ─────────────────────────────────────────────────────────────

# ── 1) 의존성 ────────────────────────────────────────────────
# package.json 의 engines 가 ">=22" 다. LTS 인 22 로 고정한다.
FROM node:22-alpine AS deps
WORKDIR /app
# 락파일만 먼저 복사한다. 소스가 바뀌어도 의존성이 그대로면
# 이 레이어가 캐시에 맞아 재설치를 건너뛴다.
COPY package.json package-lock.json ./
RUN npm ci

# ── 2) 빌드 ──────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* 는 이 시점에 클라이언트 번들로 인라인된다.
# 값은 .env 에서 온다(.dockerignore 가 일부러 남겨 둔 공개 설정 파일).
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── 3) 실행 ──────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# root 로 돌리지 않는다. 컨테이너가 뚫렸을 때 할 수 있는 일을 줄인다.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# standalone 이 안 챙겨주는 두 가지를 직접 넣는다.
#   - public/ : 아이콘, theme-init.js
#   - .next/static : 빌드된 CSS/JS 청크
# 빠뜨리면 HTML 만 오고 화면이 통째로 깨진다.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# `.env` 는 따로 COPY 하지 않는다 — next build 가 standalone 출력에 .env 와
# .env.production 을 자동으로 넣어준다(build/index.js 의 writeStandaloneDirectory).
# standalone server.js 는 부팅할 때 자기 디렉터리(__dirname)에서 이 파일을 읽는다.
# 컨테이너 ENV 가 항상 .env 를 이기므로 Cloud Run 에서 덮어쓸 수 있다
# (--update-env-vars 를 쓸 것. --set-env-vars 는 기존 변수를 전부 지운다).

# ── 누출 가드 ────────────────────────────────────────────────
# .dockerignore 가 secrets/ 와 .next 를 둘 다 빼서 여기까지 키가 올 일은 없다.
# 그런데 `next build` 의 파일 트레이싱이 admin.ts 의 경로 문자열을 따라가
# 키를 `.next/standalone/secrets/` 로 **복사한다**(실측 확인). .dockerignore
# 에서 둘 중 한 줄만 지워도 키가 조용히 이미지에 실린다.
# 조용한 유출 대신 시끄러운 빌드 실패로 만든다.
RUN if [ -e ./secrets ] || grep -rql "BEGIN PRIVATE KEY" ./.env* 2>/dev/null; then \
      echo "BUILD FAILED: 서비스 계정 키가 이미지에 포함됨. .dockerignore 의 secrets/ 와 .next 줄을 확인하라." >&2; \
      exit 1; \
    fi

USER nextjs

# Cloud Run 은 PORT 를 주입한다. 기본 8080 은 로컬에서 그냥 돌릴 때를 위한 값이다.
ENV PORT=8080
# ⚠️ HOSTNAME 을 0.0.0.0 으로 두지 않으면 서버가 루프백에만 붙어
# Cloud Run 헬스체크가 전부 실패한다. 컨테이너가 "시작은 됐는데 죽는" 증상.
ENV HOSTNAME=0.0.0.0
EXPOSE 8080

CMD ["node", "server.js"]
