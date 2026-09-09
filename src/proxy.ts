import type { NextRequest } from "next/server";
import { updateSession } from "@/shared/supabase/proxy";

/**
 * Next 16에서 `middleware.ts` → `proxy.ts` 로 이름이 바뀌었다.
 * src/ 를 쓰므로 이 파일은 src/ 안에 있어야 한다.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
