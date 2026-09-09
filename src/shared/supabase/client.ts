import { createBrowserClient } from "@supabase/ssr";

/**
 * ---------------------------------------------
 * [Feature]: Supabase 브라우저 클라이언트
 *
 * [Description]
 * - 클라이언트 컴포넌트에서 쓴다. publishable(구 anon) 키라 브라우저 노출이 정상이다.
 *   실제 권한은 RLS 정책이 결정한다.
 * - 요청마다 새로 만든다. 모듈 전역에 두지 않는다 — Fluid compute에서 요청 간
 *   상태가 섞일 수 있다.
 *
 * [Usage]
 * ```tsx
 * "use client";
 * const supabase = createClient();
 * const { data } = await supabase.from("fields").select();
 * ```
 * ---------------------------------------------
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
