import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * ---------------------------------------------
 * [Feature]: 환경변수 검증 및 클라이언트/서버 경계 강제
 *
 * [Description]
 * - 비밀이 브라우저 번들에 새는 걸 **타입과 빌드로** 막는다. 문서로 막지 않는다.
 * - `server`에 선언한 값은 클라이언트에서 접근 시 런타임 throw.
 * - 스키마 불일치는 `next build` 시점에 실패한다(조용히 undefined가 되지 않음).
 *
 * [경계 규칙 — 어기면 사고다]
 * - INSFORGE_API_KEY (ik_...)  : RLS 우회 admin 키. 서버 전용.
 * - DATABASE_URL               : postgres 특권 롤. RLS 우회. 서버 전용.
 * - OPENROUTER_API_KEY         : LLM 프로바이더 키. 서버 전용.
 * - NEXT_PUBLIC_INSFORGE_*     : anon 키. RLS로 보호됨. 브라우저 노출 OK.
 *
 * [Usage]
 * ```ts
 * import { env } from "@/shared/config/env";
 * const key = env.INSFORGE_API_KEY;        // 서버 모듈에서만
 * const url = env.NEXT_PUBLIC_INSFORGE_URL; // 어디서나
 * ```
 * ---------------------------------------------
 */
export const env = createEnv({
  server: {
    /** RLS를 우회하는 전권 키. 절대 클라이언트로 보내지 말 것. */
    INSFORGE_API_KEY: z.string().startsWith("ik_"),
    /** postgres 특권 롤 접속 문자열. LangGraph checkpointer 전용. */
    DATABASE_URL: z.string().url().optional(),
    /** LLM 프로바이더 키. InsForge Model Gateway를 써도 서버 경계 뒤에 둔다. */
    OPENROUTER_API_KEY: z.string().min(1).optional(),
    /** E2E에서 LLM을 fake로 스왑하는 플래그. */
    E2E_FAKE_LLM: z
      .string()
      .optional()
      .transform((v) => v === "1"),
  },

  client: {
    NEXT_PUBLIC_INSFORGE_URL: z.string().url(),
    NEXT_PUBLIC_INSFORGE_ANON_KEY: z.string().min(1),
  },

  // Next는 클라이언트 변수를 빌드 타임에 리터럴 치환하므로,
  // process.env를 통째로 넘기면 안 되고 키를 하나씩 적어야 한다.
  experimental__runtimeEnv: {
    NEXT_PUBLIC_INSFORGE_URL: process.env.NEXT_PUBLIC_INSFORGE_URL,
    NEXT_PUBLIC_INSFORGE_ANON_KEY: process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY,
  },

  // 빈 문자열은 미설정으로 취급. `FOO=` 같은 실수를 잡는다.
  emptyStringAsUndefined: true,
});

/**
 * InsForge 공식 문서의 배포 예제가 anon 자리에 admin 키를 넣으라고 적혀 있다:
 *   `deployments env set VITE_INSFORGE_ANON_KEY ik_xxx`   ← ik_ 는 admin 접두
 * 그대로 따라 하면 RLS를 우회하는 전권 키가 브라우저 번들에 인라인되어
 * 방문자 전원에게 공개된다. 두 키의 형식을 몰라도 통하도록 "같은 값이면 중단"으로 막는다.
 *
 * 서버에서만 검사한다 — 클라이언트에서 `env.INSFORGE_API_KEY` 를 읽으면
 * t3-env Proxy가 먼저 throw하기 때문이다.
 */
if (
  typeof window === "undefined" &&
  env.NEXT_PUBLIC_INSFORGE_ANON_KEY === env.INSFORGE_API_KEY
) {
  throw new Error(
    "NEXT_PUBLIC_INSFORGE_ANON_KEY 에 admin 키(INSFORGE_API_KEY)가 들어있습니다. " +
      "이 값은 브라우저 번들에 인라인되어 공개됩니다. " +
      "anon 키는 `npx @insforge/cli secrets get ANON_KEY` 로 받으세요.",
  );
}
