/**
 * ---------------------------------------------
 * [Feature]: Supabase 설정 한 곳에서 읽기
 *
 * [Description]
 * - URL·키를 여러 파일에서 `process.env` 로 직접 읽으면, 하나가 비었을 때
 *   "undefined 가 URL 자리에 들어가 fetch 가 이상한 곳으로 간다" 같은 증상이
 *   먼저 보이고 원인은 나중에 드러난다. 여기서 한 번에 검사하고 던진다.
 * - **`NEXT_PUBLIC_` 접두가 붙은 값만 브라우저에 나간다.** 접두가 판단 기준이지
 *   변수 이름이 아니다. service role 키는 이 파일의 `serverConfig()` 로만 읽고,
 *   그 함수는 브라우저에서 부르면 던진다.
 * - 값을 모듈 최상위에서 읽지 않고 함수로 감싼 이유: 빌드 시점에 없어도
 *   **빌드는 통과**해야 하기 때문이다. 배포 환경변수는 런타임에 들어온다.
 *
 * [Usage]
 * ```ts
 * const { url, anonKey } = publicConfig();
 * const { serviceRoleKey } = serverConfig();   // 서버에서만
 * ```
 * ---------------------------------------------
 */

export interface SupabasePublicConfig {
  url: string;
  anonKey: string;
}

/** 값이 비었을 때 사람이 볼 유일한 단서다. 무엇을 어디에 넣으라고 적는다. */
function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new Error(
      `환경변수 ${name} 이 비어 있습니다. ` +
        `Supabase 대시보드 > Project Settings > API 에서 값을 가져와 ` +
        `.env(공개값) 또는 배포 환경변수(시크릿)에 넣으세요.`,
    );
  }
  return value.trim();
}

/** 브라우저·서버 어디서나 쓴다. 둘 다 공개값이다. */
export function publicConfig(): SupabasePublicConfig {
  return {
    url: required(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    ),
    anonKey: required(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
  };
}

/**
 * 서버 전용. **RLS 를 통째로 우회하는 키**를 읽는다.
 *
 * 브라우저에서 부르면 던진다 — 번들에 섞여 들어오는 실수를 배포 전에 잡는다.
 * (그래도 `NEXT_PUBLIC_` 이 안 붙었으므로 Next 가 애초에 번들에 넣지 않는다.
 *  이 검사는 두 번째 방어선이다.)
 */
export function serverConfig(): SupabasePublicConfig & {
  serviceRoleKey: string;
} {
  if (typeof window !== "undefined") {
    throw new Error(
      "serverConfig() 가 브라우저에서 호출됐습니다. service role 키는 " +
        "RLS 를 우회하므로 절대 클라이언트로 나가면 안 됩니다. import 경로를 확인하세요.",
    );
  }
  return {
    ...publicConfig(),
    serviceRoleKey: required(
      "SUPABASE_SERVICE_ROLE",
      process.env.SUPABASE_SERVICE_ROLE,
    ),
  };
}
