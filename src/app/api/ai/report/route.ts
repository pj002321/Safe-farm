import { NextResponse } from "next/server";
import { parsePlotId } from "@/features/ask/domain/askQuestion";
import { aiService } from "@/shared/aiService/client";
import { requireConsent } from "@/shared/auth/consentGate";

/**
 * ---------------------------------------------
 * [Feature]: 밭 AI 생육 리포트 프록시  →  GET /api/ai/report?plotId=...
 *
 * [Description]
 * - `/api/ai/ask` 와 같은 이유로 존재한다 — 브라우저가 ai-service 를 직접 부르면
 *   서비스 토큰이 노출된다.
 * - **`userId` 를 쿼리에서 받지 않는다.** 세션에서 확인한 값만 싣는다. 밭 소유
 *   확인은 ai-service `_owned_plot` 이 하지만, 그 확인의 입력값(user_id) 자체가
 *   여기서 조작되면 의미가 없다.
 * - 결과를 저장하지 않는다 — 부를 때마다 ai-service 가 새로 계산·생성한다.
 *
 * [Usage]
 * ```ts
 * const res = await fetch(`/api/ai/report?plotId=${plotId}`);
 * ```
 * ---------------------------------------------
 */

const UNAVAILABLE_MESSAGE =
  "지금은 리포트를 만들 수 없습니다. 잠시 뒤 다시 시도해 주세요.";

export async function GET(request: Request): Promise<Response> {
  let viewerId: string;
  try {
    const { viewer } = await requireConsent();
    viewerId = viewer.id;
  } catch {
    return NextResponse.json(
      { error: "로그인이 필요합니다." },
      { status: 401 },
    );
  }

  const plotId = parsePlotId(new URL(request.url).searchParams.get("plotId"));
  if (!plotId) {
    return NextResponse.json({ error: "밭을 선택해 주세요." }, { status: 400 });
  }

  const result = await aiService.plotReport(viewerId, plotId);
  if (!result.ok) {
    console.error(
      "[report] ai-service 호출 실패",
      result.reason,
      result.detail,
    );
    return NextResponse.json({ error: UNAVAILABLE_MESSAGE }, { status: 502 });
  }

  return NextResponse.json(result.data);
}
