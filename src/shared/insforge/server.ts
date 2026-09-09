import { createServerClient } from "@insforge/sdk/ssr";
import { env } from "@/shared/config/env";

/**
 * ---------------------------------------------
 * [Feature]: InsForge 서버 클라이언트 (현재 사용자 신분)
 *
 * [Description]
 * - `admin.ts` 와 헷갈리지 말 것. 세 개가 각각 다르다:
 *     client.ts  브라우저 · anon · RLS 적용
 *     server.ts  서버     · 로그인한 그 사용자 · RLS 적용   ← 이 파일
 *     admin.ts   서버     · 전권 · RLS 우회
 * - SDK가 요청 쿠키에서 세션을 읽어 사용자 신분으로 요청한다.
 *   따라서 RLS 정책이 그대로 걸리고, 남의 데이터가 보이지 않는다.
 * - Server Action / Route Handler / Server Component에서 쓴다.
 *
 * [Usage]
 * ```ts
 * const insforge = getServerInsforge();
 * const { data } = await insforge.database.from("fields").select(); // 내 밭만
 * ```
 * ---------------------------------------------
 */
export function getServerInsforge() {
  return createServerClient({
    baseUrl: env.NEXT_PUBLIC_INSFORGE_URL,
    anonKey: env.NEXT_PUBLIC_INSFORGE_ANON_KEY,
  });
}
