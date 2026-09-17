import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { aiService } from "@/shared/aiService/client";

/**
 * ---------------------------------------------
 * [Feature]: 배치 스케줄러 수신부  →  POST /api/cron/{job}
 *
 * [Description]
 * - Supabase `pg_cron` 이 `pg_net` 으로 이 경로를 친다. 여기가 받아서 내부망으로
 *   ai-service 를 부른다.
 * - **왜 한 단계를 거치는가.** `pg_net` 은 Supabase 인프라에서 나가는 HTTP라
 *   대상이 공개 URL 이어야 한다. 그런데 ai-service 는 공개하지 않는다 — LLM
 *   엔드포인트가 같은 앱에 있어 열면 남이 우리 요금을 쓴다(ai-service
 *   `Dockerfile` 주석). 그래서 이미 공개된 Next 가 받고, ai-service 는 닫아 둔다.
 * - **세션이 아니라 공유 비밀로 인증한다.** 호출자가 사람이 아니므로 쿠키가
 *   존재할 수 없다. `proxySession.ts` 의 `PUBLIC_PREFIXES` 에 `/api/cron` 이
 *   들어 있는 것과 한 쌍이다 — 거기서 빠지면 요청이 `/login` 으로 307 되어
 *   배치가 조용히 안 돈다.
 *
 * [Usage]
 * ```sql
 * select net.http_post(
 *   url     := 'https://<도메인>/api/cron/tasks',
 *   headers := jsonb_build_object('Authorization', 'Bearer ' || <CRON_SECRET>)
 * );
 * ```
 * ---------------------------------------------
 */

/**
 * 돌릴 수 있는 배치. **화이트리스트다** — 경로 조각이 그대로 동작으로 이어지므로
 * 목록에 없는 값은 실행하지 않는다.
 */
const JOBS = {
  /** 매일 00:00 KST. 모든 밭의 오늘 할 일 카드를 판정한다. */
  tasks: () => aiService.generateAllTasks(),
  /** 30분마다. KMA 기상특보 스냅샷을 적재한다. */
  alerts: () => aiService.ingestAlerts(),
} as const;

type JobName = keyof typeof JOBS;

function isJobName(value: string): value is JobName {
  return Object.hasOwn(JOBS, value);
}

/**
 * 토큰 비교. **`===` 를 쓰지 않는다** — 문자열 비교는 첫 불일치에서 멈춰 응답
 * 시간이 달라지고, 그 차이로 토큰을 한 글자씩 알아낼 수 있다.
 *
 * 길이가 다르면 `timingSafeEqual` 이 던지므로, 양쪽을 먼저 SHA-256 으로 눌러
 * 항상 32바이트로 맞춘다. 길이 자체도 정보이므로 이 편이 낫다.
 */
function tokenMatches(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

// `params` 는 Next 16 에서 **Promise 다**(동기 객체가 아니다).
// 전역 `RouteContext<"/api/cron/[job]">` 헬퍼도 있지만 그건 `next build` 가
// 만들어 내는 타입이라, 빌드 전 `tsc --noEmit` 에서는 존재하지 않는다.
// 문서가 함께 제시하는 명시적 형태를 쓴다.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ job: string }> },
) {
  const expected = process.env.CRON_SECRET?.trim();

  // 비밀이 설정되지 않았으면 **거부한다.** "없으면 통과" 로 만들면 환경변수를
  // 빠뜨린 배포가 조용히 무인증으로 열린다(ai-service `security.py` 와 같은 판단).
  if (!expected) {
    return NextResponse.json({ error: "not-configured" }, { status: 503 });
  }

  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!given || !tokenMatches(given, expected)) {
    // 왜 틀렸는지 알려주지 않는다(헤더 없음 vs 값 불일치).
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { job } = await params;
  if (!isJobName(job)) {
    return NextResponse.json({ error: "unknown-job" }, { status: 404 });
  }

  const result = await JOBS[job]();

  if (!result.ok) {
    // 크론에게 실패를 **실패로** 알린다. 200 으로 뭉개면 cron.job_run_details 가
    // 전부 성공으로 보여, 배치가 몇 주째 안 돌아도 아무도 모른다.
    console.error(`[cron] ${job} 실패`, result.reason, result.detail);
    return NextResponse.json(
      { job, error: result.reason, detail: result.detail ?? null },
      { status: 502 },
    );
  }

  console.info(`[cron] ${job} 완료`, result.data);
  return NextResponse.json({ job, ...result.data });
}
