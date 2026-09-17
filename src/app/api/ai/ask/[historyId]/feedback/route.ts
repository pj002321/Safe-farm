import { NextResponse } from "next/server";
import { aiService } from "@/shared/aiService/client";
import { requireConsent } from "@/shared/auth/consentGate";

/**
 * ---------------------------------------------
 * [Feature]: 답변 피드백 프록시  →  POST /api/ai/ask/{historyId}/feedback
 *
 * [Description]
 * - `/api/ai/ask` 와 같은 이유로 프록시를 거친다. 서비스 토큰을 브라우저에 주지
 *   않으려는 것이다.
 * - **`user_id` 는 세션에서 채운다.** ai-service 는 `history_id` 와 `user_id` 가
 *   둘 다 맞는 행에만 평가를 남기므로, 이 값이 곧 "남의 답변에 평가 못 남김"을
 *   지탱한다. 본문에서 받으면 그 보호가 사라진다.
 * - 사유는 자유 입력이라 개인정보가 섞일 수 있다. 길이를 여기서 한 번 자르고
 *   (ai-service 도 200자에서 422 로 막는다), 저장된 값을 되읽는 경로는 만들지 않는다.
 * ---------------------------------------------
 */

/** ai-service `FEEDBACK_REASON_MAX` 와 같은 값. 넘으면 422 가 나므로 미리 자른다. */
const REASON_MAX_LENGTH = 200;

export async function POST(
  request: Request,
  context: RouteContext<"/api/ai/ask/[historyId]/feedback">,
): Promise<Response> {
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

  const { historyId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const payload = (body ?? {}) as Record<string, unknown>;
  const rating = payload.rating;
  if (rating !== "up" && rating !== "down") {
    return NextResponse.json({ error: "잘못된 평가입니다." }, { status: 400 });
  }

  const reason =
    typeof payload.reason === "string"
      ? payload.reason.trim().slice(0, REASON_MAX_LENGTH)
      : null;

  const result = await aiService.askFeedback(
    historyId,
    viewerId,
    rating,
    reason,
  );

  if (!result.ok) {
    console.error("[ask] 피드백 저장 실패", result.reason, result.detail);
    return NextResponse.json(
      { error: "평가를 남기지 못했습니다." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
