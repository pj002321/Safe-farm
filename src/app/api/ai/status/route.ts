import { NextResponse } from "next/server";
import { aiService } from "@/shared/aiService/client";
import { requireAdmin } from "@/shared/auth/session";

/**
 * ---------------------------------------------
 * [Feature]: ai-service 연결 상태 확인 (관리자 전용)
 *
 * [Description]
 * - Next ↔ ai-service 통신이 실제로 서는지 확인하는 자리다. 배포 직후
 *   "환경변수가 맞나, 내부망이 닿나, 토큰이 같은가"를 이 한 번의 호출로 가른다.
 * - **관리자만 부를 수 있다.** 실패 사유에 내부 설정의 상태(DB 연결 여부 등)가
 *   드러나므로, 로그인만 한 사용자에게도 열지 않는다.
 * - `requireAdmin()` 을 **첫 줄에서** 부른다. Route Handler 는 그 자체로
 *   공개 엔드포인트라 페이지·레이아웃의 검사가 여기까지 미치지 않는다.
 * - 실패해도 500 을 내지 않는다. 사유를 그대로 돌려줘야 "아직 설정 전"과
 *   "고장"을 구분할 수 있다 — 500 으로 뭉개면 둘 다 똑같이 보인다.
 *
 * [Usage]
 * ```
 * GET /api/ai/status   (관리자 세션 필요)
 * ```
 * ---------------------------------------------
 */

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    // 관리자가 아니면 존재 여부도 알리지 않는다.
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const result = await aiService.status();

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, reason: result.reason, detail: result.detail ?? null },
      // 우리 설정 문제(200 으로 알림)와 상대 장애(502)를 나눈다.
      { status: result.reason === "not-configured" ? 200 : 502 },
    );
  }

  return NextResponse.json({ ok: true, ...result.data });
}
