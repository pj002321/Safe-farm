import { createAdminClient } from "@insforge/sdk";
import { env } from "@/shared/config/env";

/**
 * ---------------------------------------------
 * [Feature]: InsForge 어드민 클라이언트 (ik_ 키, RLS 우회)
 *
 * [Description]
 * - `ik_` 키는 RLS를 우회하는 전권 키다. 다음에만 쓴다:
 *   관리자 작업, RLS로 표현 불가능한 크로스테이블 불변식, 시스템 배치.
 * - 일반 사용자 요청 경로에서는 쓰지 말 것. 그건 anon + RLS의 몫이다.
 *
 * [서버 전용인 이유와 보호 장치]
 * - `INSFORGE_API_KEY`에는 `NEXT_PUBLIC_` 접두가 없다. Next는 접두가 없는 값을
 *   브라우저 번들에 인라인하지 않으므로 **키 자체는 클라이언트로 새지 않는다.**
 * - 그럼에도 클라이언트 컴포넌트에서 이 모듈을 import하면 `env.INSFORGE_API_KEY`
 *   접근 시 t3-env의 Proxy가 런타임에 throw한다. 조용히 동작하지 않는다.
 * - 따라서 이 모듈은 Server Action / Route Handler / Server Component에서만
 *   import한다.
 *
 * [Usage]
 * ```ts
 * // Server Action 또는 Route Handler에서
 * import { admin } from "@/shared/insforge/admin";
 * await admin.database.from("prediction_jobs").insert({ field_id });
 * ```
 * ---------------------------------------------
 */
export const admin = createAdminClient({
  baseUrl: env.NEXT_PUBLIC_INSFORGE_URL,
  apiKey: env.INSFORGE_API_KEY,
});
