import { NextResponse } from "next/server";
import { requireUser } from "@/shared/auth/session";
import { listPlots } from "@/features/plots/plotStore";

/**
 * ---------------------------------------------
 * [Feature]: 로그인한 사용자의 텃밭 목록 조회
 *
 * [Description]
 * - `listPlots()` 는 이미 있다 — map/page.tsx 가 Server Component 에서 직접
 *   부르던 것을 REST 로도 열어준다. 클라이언트 fetch(새로고침 없는 갱신 등)용.
 * - `requireUser()` 를 첫 줄에서 부른다. 비로그인 요청은 401.
 *
 * [Usage]
 * ```
 * GET /api/plots   (로그인 필요)
 * ```
 * ---------------------------------------------
 */

export async function GET() {
  let userId: string;
  try {
    userId = (await requireUser()).id;
  } catch {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const plots = await listPlots(userId);
  return NextResponse.json({ plots });
}
