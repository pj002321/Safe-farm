import "server-only";

import { getSupabaseAdmin } from "@/shared/supabase/server";
import type { Role } from "./session";

/**
 * ---------------------------------------------
 * [Feature]: 관리자 화면용 계정 목록
 *
 * [Description]
 * - **읽기 전용이다.** 역할을 바꾸는 함수를 여기 두지 않는다. 화면에서 부를 수
 *   있는 곳에 권한 변경이 있으면, 그 화면의 접근 제어가 한 번 헐거워지는 순간
 *   권한 상승 경로가 된다. 역할 부여는 `npm run role` 스크립트가 한다.
 * - 역할은 **`app_metadata.role`** 에서 읽는다. `profiles.role` 컬럼은 표시용
 *   사본이라 이 목록의 근거로 쓰면 실제 권한과 어긋난 화면이 나온다.
 * - `getSupabaseAdmin()` 은 **RLS 를 우회**한다. 그래서 이 파일은 `server-only`
 *   이고, 부르는 쪽(`(admin)/layout.tsx`)이 이미 `requireAdminOrRedirect` 로
 *   막고 있어야 한다.
 * - 날짜를 **서버에서 문자열로 만들어** 내려보낸다. 클라이언트에서 포맷하면
 *   사용자 시간대에 따라 값이 달라져 하이드레이션 불일치가 난다.
 *
 * [Usage]
 * ```tsx
 * const accounts = await listAccounts();
 * ```
 * ---------------------------------------------
 */

export interface AccountSummary {
  id: string;
  email: string | null;
  role: Role;
  /** 로그인 수단. "email", "google" 등. */
  providers: string[];
  /** 이미 포맷된 한국 시각. 화면은 그대로 찍기만 한다. */
  createdAtKo: string;
}

/**
 * 한 번에 가져올 인원.
 *
 * 지금은 사용자가 손에 꼽아 페이지네이션이 없다. **넘어가면 조용히 잘린다** —
 * 화면에 "이게 전부"라고 보이므로, 이 수를 넘기 시작하면 페이지네이션을
 * 붙여야 한다. 그때까지는 이 상수가 그 한계를 드러내는 자리다.
 */
const PAGE_SIZE = 200;

function formatKo(iso: string | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(date);
}

export async function listAccounts(): Promise<AccountSummary[]> {
  const { data, error } = await getSupabaseAdmin().auth.admin.listUsers({
    page: 1,
    perPage: PAGE_SIZE,
  });
  if (error) throw error;

  return data.users.map((user) => {
    // 권한의 진짜 출처. user_metadata 는 사용자가 고칠 수 있어 보지 않는다.
    const role: Role = user.app_metadata?.role === "admin" ? "admin" : "user";

    // identities 가 없으면 app_metadata.provider 로 대신한다(초기 계정 등).
    const providers =
      user.identities?.map((identity) => identity.provider) ??
      (typeof user.app_metadata?.provider === "string"
        ? [user.app_metadata.provider]
        : []);

    return {
      id: user.id,
      email: user.email ?? null,
      role,
      providers,
      createdAtKo: formatKo(user.created_at),
    };
  });
}
