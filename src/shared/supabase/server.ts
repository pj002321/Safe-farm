import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { publicConfig, serverConfig } from "./config";

/**
 * ---------------------------------------------
 * [Feature]: 서버용 Supabase 클라이언트 2종
 *
 * [Description]
 * - `getSupabaseServer()` — **사용자로서** 질의한다. 요청 쿠키의 세션을 들고
 *   가므로 RLS 가 그대로 걸린다. Server Component·Route Handler·Server Action
 *   에서 쓰는 기본값이다.
 * - `getSupabaseAdmin()` — **RLS 를 우회**한다. 역할 부여처럼 사용자 권한으로는
 *   할 수 없는 일에만 쓴다. Firebase 의 Admin SDK 와 같은 급이고, 브라우저로
 *   나가는 순간 전 사용자 데이터가 열린다.
 * - **쿠키 어댑터는 `getAll`/`setAll` 만 쓴다.** 공식 문서가 `get`/`set`/`remove`
 *   개별 메서드에 대해 "Break in production", "Cause authentication loops" 라고
 *   못 박는다. 이름이 비슷해 헷갈리기 쉬우니 고치지 말 것.
 * - `setAll` 이 던지는 경우를 삼킨다. Server Component 는 쿠키를 쓸 수 없어
 *   Next 가 예외를 던지는데, 그 경우 토큰 갱신은 `proxy.ts` 가 이미 했다.
 *   **이건 증상 은폐가 아니라 Next 의 실행 모델이다** — 갱신 경로가 따로 있다.
 * - `server-only` 를 import 해 클라이언트 번들에 섞이면 **빌드가 깨지게** 한다.
 *   런타임에 발견하는 것보다 빌드에서 막는 편이 싸다.
 *
 * [Usage]
 * ```ts
 * const supabase = await getSupabaseServer();
 * const { data } = await supabase.from("profiles").select("*").single();
 * ```
 * ---------------------------------------------
 */

export async function getSupabaseServer() {
  const { url, anonKey } = publicConfig();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
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
          // Server Component 에서는 쿠키를 쓸 수 없다. 위 주석 참고 —
          // 토큰 갱신은 proxy.ts 가 맡으므로 여기서 실패해도 세션은 유지된다.
        }
      },
    },
  });
}

/**
 * RLS 를 우회하는 관리자 클라이언트.
 *
 * 세션을 들고 가지 않는다(`persistSession: false`). 들고 가면 서버 프로세스가
 * 마지막 사용자의 세션을 기억해, 다음 요청이 남의 권한으로 도는 사고가 난다.
 */
export function getSupabaseAdmin() {
  const { url, serviceRoleKey } = serverConfig();
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
