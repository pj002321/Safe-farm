import { NextResponse } from "next/server";
import { aiService } from "@/shared/aiService/client";
import { requireUser } from "@/shared/auth/session";

/**
 * ---------------------------------------------
 * [Feature]: 시군구 강수량 레이어 데이터 프록시
 *
 * [Description]
 * - `/api/map/sigungu-gdd` 와 같은 이유로 존재한다 — 브라우저가 ai-service 를
 *   직접 못 부르므로 이 라우트가 대신 부른다. 상세 설명은 그쪽 주석 참고.
 * ---------------------------------------------
 */

export async function GET() {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const result = await aiService.sigunguRain();
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason, detail: result.detail ?? null },
      { status: result.reason === "not-configured" ? 200 : 502 },
    );
  }

  return NextResponse.json(result.data);
}
