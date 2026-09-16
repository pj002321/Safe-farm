import { NextResponse } from "next/server";
import { aiService } from "@/shared/aiService/client";
import { requireUser } from "@/shared/auth/session";

/**
 * ---------------------------------------------
 * [Feature]: 시군구 GDD 색칠 지도 데이터 프록시 (V1-37)
 *
 * [Description]
 * - 브라우저가 ai-service 를 직접 못 부르므로(내부망 + 서비스 토큰) 이 라우트가 대신 부른다.
 * - 로그인한 사용자면 누구나 볼 수 있다 — 개인정보가 아니라 지역 기상 통계라 관리자로
 *   제한할 이유가 없다(`/api/ai/status` 와 다른 점).
 * - `requireUser()` 는 Server Action 전용이라 던지기만 한다. Route Handler 는
 *   그 자체가 공개 엔드포인트라 여기서 직접 잡아 404 로 바꾼다(`/api/ai/status` 와 동일).
 * ---------------------------------------------
 */

export async function GET() {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const result = await aiService.sigunguGdd();
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason, detail: result.detail ?? null },
      { status: result.reason === "not-configured" ? 200 : 502 },
    );
  }

  return NextResponse.json(result.data);
}
