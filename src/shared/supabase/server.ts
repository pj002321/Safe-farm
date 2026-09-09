import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * ---------------------------------------------
 * [Feature]: Supabase 서버 클라이언트
 *
 * [Description]
 * - Server Component · Server Action · Route Handler 전부 이걸 쓴다.
 * - Next 16부터 `cookies()`가 async이므로 이 팩토리도 async다.
 * - Server Component에서는 쿠키를 쓸 수 없어 `setAll`이 던진다. proxy가 세션을
 *   갱신해 주므로 무시해도 된다 — 그래서 try/catch로 삼킨다. 이건 증상 은폐가
 *   아니라 프레임워크가 정한 계약이다.
 *
 * [Usage]
 * ```ts
 * const supabase = await createClient();
 * const { data } = await supabase.from("fields").select();
 * ```
 * ---------------------------------------------
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Component에서 호출된 경우. proxy가 세션을 갱신하므로 무시.
          }
        },
      },
    },
  );
}
