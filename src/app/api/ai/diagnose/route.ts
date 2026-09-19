import { NextResponse } from "next/server";
import {
  parseDiagnoseQuestion,
  parseImageDataUrl,
} from "@/features/diagnose/domain/diagnoseImage";
import { aiService } from "@/shared/aiService/client";
import { requireConsent } from "@/shared/auth/consentGate";

/**
 * ---------------------------------------------
 * [Feature]: 사진 진단 프록시  →  POST /api/ai/diagnose
 *
 * [Description]
 * - 브라우저가 ai-service 를 직접 부르지 못하게 하는 자리다 — `/api/ai/ask` 와 같은
 *   이유(서비스 토큰 노출 방지).
 * - `requireConsent()` 를 첫 줄에서 부른다. 로그인 여부만 확인할 뿐 저장은 하지
 *   않으므로 viewer.id 를 ai-service 에 넘기지 않는다(일회성, 이력 없음).
 * - 스트리밍하지 않는다 — 진단은 근거 조각 없이 한 번에 온다(`/ask` 와 다른 점).
 *
 * [Usage]
 * ```ts
 * const res = await fetch("/api/ai/diagnose", {
 *   method: "POST",
 *   body: JSON.stringify({ imageDataUrl, question }),
 * });
 * ```
 * ---------------------------------------------
 */

const UNAVAILABLE_MESSAGE =
  "지금은 진단을 드릴 수 없습니다. 잠시 뒤 다시 시도해 주세요.";

export async function POST(request: Request): Promise<Response> {
  try {
    await requireConsent();
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
      { error: "사진을 읽지 못했습니다." },
      { status: 400 },
    );
  }

  const payload = (body ?? {}) as Record<string, unknown>;
  const image = parseImageDataUrl(payload.imageDataUrl);
  if (!image.ok) {
    return NextResponse.json({ error: image.error }, { status: 400 });
  }

  const result = await aiService.diagnoseImage(
    image.value,
    parseDiagnoseQuestion(payload.question),
  );

  if (!result.ok) {
    console.error(
      "[diagnose] ai-service 호출 실패",
      result.reason,
      result.detail,
    );
    return NextResponse.json({ error: UNAVAILABLE_MESSAGE }, { status: 502 });
  }

  return NextResponse.json(result.data);
}
