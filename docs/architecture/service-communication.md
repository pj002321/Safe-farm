# Next ↔ ai-service 통신 규약

Next.js 앱과 FastAPI(`ai-service`)가 어떻게 이야기하는지, 그리고 **왜 그렇게
정했는지**를 적는다. 설정값만 필요하면 [빠른 설정](#빠른-설정)으로.

---

## 한 장 요약

```
브라우저
   │  (공개 인터넷)
   ▼
Next.js  ── Railway 내부망 ──▶  ai-service (FastAPI)
   │        Wireguard 암호화          │
   │                                  ▼
   └──────────────────────────▶  Supabase (서울)
                                 Postgres + pgvector
```

| 원칙 | 이유 |
|---|---|
| **ai-service 에 공개 도메인을 붙이지 않는다** | LLM 을 호출하므로 열면 남이 우리 OpenAI 요금을 쓴다 |
| **브라우저는 ai-service 를 직접 부르지 않는다** | 서비스 토큰이 노출된다 |
| **DB 는 Railway 가 아니라 Supabase 에 둔다** | 데이터는 한 곳에, 앱은 재배포 가능한 상태로 |

---

## 빠른 설정

### Railway — Next 서비스 변수

```
AI_SERVICE_URL=http://ai-service.railway.internal:8000
AI_SERVICE_TOKEN=<양쪽 같은 값>
```

### Railway — ai-service 서비스 변수

```
AI_SERVICE_TOKEN=<양쪽 같은 값>
DATABASE_URL=postgresql://postgres.<프로젝트REF>:<비번>@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres
OPENAI_API_KEY=<키>
```

> **`AI_SERVICE_URL` 은 `https` 가 아니라 `http` 다.** 내부망은 Wireguard 로
> 이미 암호화돼 있고, `*.railway.internal` 에는 TLS 인증서가 없다. `https` 로
> 부르면 인증서 검증에서 실패한다.

> **`DATABASE_URL` 은 Session mode(5432)** 를 쓴다. Direct(`db.<REF>.supabase.co`)
> 는 IPv6 전용이라 컨테이너 호스트에 따라 붙지 않는다.

`AI_SERVICE_TOKEN` 은 아무 긴 난수면 된다:

```bash
openssl rand -hex 32
```

---

## 인증

서비스 토큰 하나를 공유한다. JWT 가 아닌 이유는 **호출자가 우리 서버 하나뿐**
이라 발급·폐기 절차가 필요 없기 때문이다. 호출자가 늘면 그때 바꾼다.

```
Next  ──▶  X-Service-Token: <토큰>  ──▶  ai-service
```

### 왜 내부망만 믿지 않는가

내부망은 이미 격리돼 있다. 그럼에도 토큰을 두는 이유:

1. **공개 도메인을 실수로 한 번 붙이는 순간** LLM 엔드포인트가 인터넷에 열린다.
   그때 남는 방어선이 이것 하나다.
2. 같은 Railway 프로젝트에 나중에 생기는 다른 서비스도 내부망 안이다.

### 구현에서 지킨 것

| | |
|---|---|
| `secrets.compare_digest` | `==` 는 첫 불일치에서 멈춰 응답 시간이 달라진다. 그 차이로 토큰을 한 글자씩 알아낼 수 있다 |
| **토큰 미설정 → 503** | "설정이 없으면 통과"로 만들면 환경변수를 빠뜨린 배포가 조용히 무인증으로 열린다 |
| 401 사유를 구분하지 않음 | "헤더 없음"과 "값 불일치"를 나눠 주면 공격자가 탐색 범위를 좁힌다 |

---

## 엔드포인트

### `GET /health` — 토큰 불필요

Railway 헬스체크가 쓴다. **DB 를 건드리지 않는다** — 헬스체크가 DB 를 타면
DB 가 잠깐 흔들릴 때 플랫폼이 컨테이너를 죽이고 재시작을 반복한다.

```json
{ "status": "ok", "service": "ai-service",
  "config": { "database_url": true, "openai_api_key": true, ... } }
```

설정은 **불리언으로만** 알린다. 값을 돌려주면 `DATABASE_URL` 의 비밀번호와
API 키가 그대로 노출된다.

### `GET /health/db` — 토큰 불필요

DB 까지 실제로 왕복한다. 실패해도 500 을 내지 않고 `ok: false` 와 **예외
타입만** 돌려준다 — 오류 메시지에 접속 문자열이 섞이기 때문이다.

```json
{ "ok": false, "error": "RuntimeError" }
```

### `GET /v1/status` — 토큰 필요

무엇이 **구현됐고 무엇이 아직 아닌지** 알린다. Next 가 "지금 리포트를
요청해도 되는가"를 이걸로 판단한다.

```json
{
  "service": "ai-service",
  "version": "0.1.0",
  "ready": false,
  "capabilities": {
    "embedding": false,
    "retrieval": false,
    "reportGeneration": false
  },
  "config": { "database": false, "llm": false,
              "embedModel": "text-embedding-3-small", "dimension": 1536 }
}
```

`capabilities` 를 정직하게 `false` 로 둔다. 아직 없는 기능을 `true` 로 두면
Next 가 호출했다가 `NotImplementedError` 를 500 으로 받는다.

---

## Next 쪽 클라이언트

`src/shared/aiService/client.ts`

```ts
const result = await aiService.status();
if (!result.ok) {
  // result.reason 으로 분기
  return;
}
result.data.ready;
```

### 실패를 예외가 아니라 값으로 돌려준다

이 호출은 **실패가 정상 경로의 일부**다 — 아직 구현 안 된 기능, DB 미연결,
콜드 스타트. 화면이 그때마다 500 을 띄우는 대신 "지금은 안 된다"를 말할 수
있어야 한다.

| `reason` | 뜻 | 봐야 할 곳 |
|---|---|---|
| `not-configured` | 우리 쪽 환경변수가 없다 | Next 서비스 변수 |
| `unauthorized` | 토큰 불일치 | 양쪽 `AI_SERVICE_TOKEN` |
| `unavailable` | 연결 자체가 안 된다 | ai-service 가 살아 있는가, 서비스명이 맞는가 |
| `timeout` | 5초 초과 | 콜드 스타트 또는 ai-service 가 멈춤 |
| `bad-response` | 200 인데 모양이 다르다 | 계약이 어긋났다 |

전부 "실패"로 뭉개면 **설정 누락과 일시 장애를 구분할 수 없다.**

### 반드시 지킨 것

- **`server-only`** — 클라이언트 번들에 섞이면 빌드가 깨진다. 브라우저에
  토큰이 나가는 것을 런타임이 아니라 빌드에서 막는다.
- **타임아웃** — 없으면 ai-service 가 멈췄을 때 Next 요청이 함께 매달려,
  한쪽 장애가 전체 장애가 된다.
- **`cache: "no-store"`** — 상태 조회가 캐시되면 "이미 고쳤는데 화면은 계속
  안 된다고 하는" 상황이 된다.

---

## 확인하는 법

### `GET /api/ai/status` (관리자 세션 필요)

배포 직후 "환경변수가 맞나, 내부망이 닿나, 토큰이 같은가"를 한 번에 가른다.

```
성공  { "ok": true, "ready": false, "capabilities": {...} }
실패  { "ok": false, "reason": "unauthorized", "detail": "..." }
```

관리자가 아니면 **404** 를 돌려준다 — 실패 사유에 내부 설정 상태가 드러나므로
엔드포인트의 존재 자체를 알리지 않는다.

### 로컬에서

```bash
docker build -t ai-service ai-service/
docker run --rm -p 8000:8000 -e AI_SERVICE_TOKEN=test ai-service
```

```bash
curl -s -H "X-Service-Token: test" http://localhost:8000/v1/status
```

---

## 밟았던 함정

### `--host ::` 로 바꾸지 말 것

듀얼스택을 노리고 바꿨다가 되돌렸다. 실측 결과:

```
컨테이너 안에서  [::1]     → 200
                 127.0.0.1 → 실패
```

소켓의 `IPV6_V6ONLY` 기본값이 `0` 인데도 uvicorn 의 IPv6 소켓이 IPv4 를 받지
않는다. Railway 내부 DNS 는 IPv4·IPv6 양쪽으로 해석되므로 **`0.0.0.0` 으로
충분하다.**

### Root Directory 는 피할 수 없다

한 저장소에 서비스가 둘이라 Railway 가 구분할 방법이 그것뿐이다.
나머지(빌드·헬스체크·감시경로)는 `railway.json` 으로 코드에 내렸다.

```
ai-service 서비스 → Settings → Root Directory: ai-service
```

앞에 슬래시를 붙이지 않는다.

### `main` 이 비어 있으면 Root Directory 를 못 찾는다

Railway 가 새 서비스에 기본 브랜치를 잡는데, `main` 에 소스가 없으면
`Root directory "/ai-service" was not found` 로 실패한다. 실제로 이것 때문에
한 번 막혔다.

---

## 아직 없는 것

| | 상태 |
|---|---|
| 리포트 생성 엔드포인트 | ai-service 의 RAG(`embed_texts`·`vector_store.search`·`nodes.generate`)가 미구현 |
| 스트리밍 응답 | LLM 응답이 길어지면 필요. `/v1/status` 가 먼저 `ready: true` 가 돼야 한다 |
| 재시도 | 콜드 스타트 대비. 지금은 `unavailable` 을 그대로 화면에 올린다 |

`capabilities.reportGeneration` 이 `true` 가 되는 시점에 위 셋을 같이 본다.
