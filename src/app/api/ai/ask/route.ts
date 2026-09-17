import { NextResponse } from "next/server";
import { parsePlotId, parseQuestion } from "@/features/ask/domain/askQuestion";
import { aiService } from "@/shared/aiService/client";
import { requireConsent } from "@/shared/auth/consentGate";

/**
 * ---------------------------------------------
 * [Feature]: AI 질의응답 프록시  →  POST /api/ai/ask
 *
 * [Description]
 * - 브라우저가 ai-service 를 직접 부르지 못하게 하는 자리다. 직접 열면 서비스
 *   토큰이 브라우저로 나가고, 그 순간 남이 우리 OpenAI 요금을 쓴다.
 * - **`user_id` 를 본문에서 받지 않는다.** 세션에서 확인한 값만 실어 보낸다.
 *   받았다면 아무나 남의 id 를 적어 남의 이력에 질문을 쌓고 남의 하루 한도를
 *   태울 수 있다. 본문에 `userId` 가 섞여 와도 무시된다.
 * - `requireConsent()` 를 **첫 줄에서** 부른다. Route Handler 는 그 자체로 공개
 *   엔드포인트라 레이아웃의 동의 게이트가 여기까지 미치지 않는다(AGENTS.md).
 * - Server Action 이 아니라 Route Handler 인 이유는 **스트리밍**이다. 액션은 한
 *   번의 반환값으로 끝나서 토큰이 오는 대로 보여줄 수 없다.
 * - 응답을 다시 조립하지 않고 **그대로 흘려보낸다.** 여기서 SSE 를 파싱하면
 *   프록시가 한 번, 브라우저가 또 한 번 파싱하게 되고 그만큼 첫 글자가 늦어진다.
 *
 * [Usage]
 * ```ts
 * const res = await fetch("/api/ai/ask", {
 *   method: "POST",
 *   body: JSON.stringify({ question, plotId }),
 * });
 * ```
 * ---------------------------------------------
 */

/** 화면이 그대로 띄우는 문장. 실패 사유(설정 누락·토큰 불일치)를 사용자에게 흘리지 않는다. */
const UNAVAILABLE_MESSAGE =
  "지금은 답변을 드릴 수 없습니다. 잠시 뒤 다시 시도해 주세요.";

export async function POST(request: Request): Promise<Response> {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "질문을 읽지 못했습니다." },
      { status: 400 },
    );
  }

  const payload = (body ?? {}) as Record<string, unknown>;
  const question = parseQuestion(payload.question);
  if (!question.ok) {
    return NextResponse.json({ error: question.error }, { status: 400 });
  }

  const result = await aiService.ask(viewerId, {
    question: question.value,
    plotId: parsePlotId(payload.plotId),
  });

  if (!result.ok) {
    // 사유는 로그에만 남긴다. 설정 상태가 화면에 드러나면 그 자체가 정보다.
    console.error("[ask] ai-service 호출 실패", result.reason, result.detail);
    return NextResponse.json({ error: UNAVAILABLE_MESSAGE }, { status: 502 });
  }

  const contentType =
    result.response.headers.get("content-type") ?? "application/json";

  // 근거를 찾으면 SSE, 못 찾거나 막히면 JSON 이 온다. 어느 쪽이든 본문을 읽지 않고
  // 그대로 넘긴다 — 여기서 읽으면 스트리밍이 통째로 버퍼링된다.
  return new Response(result.response.body, {
    status: result.response.status,
    headers: {
      "Content-Type": contentType,
      // 중간 프록시가 SSE 를 모아 두면 답변이 끝나야 한 번에 보인다.
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
