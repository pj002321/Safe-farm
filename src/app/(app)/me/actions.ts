"use server";

import { redirect } from "next/navigation";
import { requireConsent } from "@/shared/auth/consentGate";
import { updateProfile } from "@/shared/auth/profileStore";

/**
 * ---------------------------------------------
 * [Feature]: 마이페이지 Server Actions
 *
 * [Description]
 * - ⚠️ **export 하나가 곧 공개 POST 엔드포인트**다(AGENTS.md). 그래서
 *     · 헬퍼를 export 하지 않는다. 아래 `fail` 은 export 가 없다.
 *     · 액션마다 **첫 줄에서** `requireConsent()` 를 부른다. 레이아웃·페이지의
 *       검사는 액션에 미치지 않는다 — 누구든 이 URL 로 바로 POST 할 수 있다.
 * - 결과를 `redirect` 로 돌려준다. `useActionState` 를 쓰면 이걸 부르는 패널이
 *   통째로 클라이언트 번들이 되고, 이 화면의 폼은 JS 없이도 동작해야 한다.
 * - 실패 메시지를 쿼리에 싣되 **원문을 그대로 싣지 않는다.** DB 오류 문구에는
 *   테이블·컬럼 이름이 섞여 나오므로(제18조) 사용자가 읽을 문장으로 바꾼다.
 *
 * [Usage]
 * ```tsx
 * <form action={updateAccount}> … </form>
 * ```
 * ---------------------------------------------
 */

/** 사용자에게 보여줄 문장만 쿼리에 싣고 그 화면으로 돌려보낸다. */
function fail(section: string, message: string): never {
  redirect(`/me?error=${section}&message=${encodeURIComponent(message)}`);
}

/** 계정 정보(이름·메일 수신) 저장. */
export async function updateAccount(formData: FormData): Promise<void> {
  await requireConsent();

  const raw = formData.get("fullName");
  const fullName = typeof raw === "string" ? raw.trim() : "";

  if (fullName.length > 40) {
    fail("account", "이름은 40자까지 쓸 수 있습니다.");
  }

  try {
    await updateProfile({
      // 빈 이름은 지우겠다는 뜻이다. 빈 문자열로 저장하면 `displayNameOf` 가
      // 이메일 앞부분으로 넘어가지 못하고 빈 이름을 그대로 그린다.
      fullName: fullName || null,
      marketingOptIn: formData.get("marketingOptIn") !== null,
    });
  } catch {
    fail("account", "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }

  redirect("/me?saved=account");
}
