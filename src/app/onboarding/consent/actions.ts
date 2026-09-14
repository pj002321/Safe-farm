"use server";

import { isConsentComplete, parseConsent } from "@/shared/auth/consent";
import { recordConsent } from "@/shared/auth/profileStore";
import { requireUser } from "@/shared/auth/session";

/**
 * ---------------------------------------------
 * [Feature]: 온보딩 동의 제출
 *
 * [Description]
 * - ⚠️ `'use server'` 파일의 **export 하나가 곧 공개 POST 엔드포인트**다. 그래서
 *   이 파일은 액션 하나만 내보내고, 헬퍼는 같이 export 하지 않는다. 페이지에서
 *   한 검사는 여기까지 오지 않으므로 `requireUser()` 를 **첫 줄에서** 부른다.
 * - 들어오는 값은 **신뢰하지 않는다.** 클라이언트가 보낸 조각을 `parseConsent` 로
 *   좁히고(불리언 `true` 만 동의로 친다), 필수 두 항목을 서버가 다시 판정한다.
 *   화면의 버튼 비활성화는 안내일 뿐 방어가 아니다.
 * - 실패를 **던지지 않고 값으로** 돌려준다. 던지면 Next 가 일반 오류 화면을
 *   띄우는데, 이 화면은 게이트라서 그 순간 사용자가 앱에 영영 못 들어온다.
 *   무엇이 잘못됐는지 화면 안에서 말해 줘야 다음 행동을 고를 수 있다.
 * ---------------------------------------------
 */

export type ConsentSubmitResult = { ok: true } | { ok: false; message: string };

export async function submitConsent(
  raw: unknown,
): Promise<ConsentSubmitResult> {
  await requireUser();

  const consent = parseConsent(raw);

  if (!isConsentComplete(consent)) {
    return { ok: false, message: "필수 항목에 모두 동의해 주세요." };
  }

  try {
    await recordConsent({
      termsAgreed: consent.terms,
      privacyAgreed: consent.privacy,
      marketingOptIn: consent.marketing,
    });
  } catch (error) {
    // 프로필 행이 없으면 갱신이 0건으로 끝나고 여기로 온다. 성공으로 넘기면
    // 게이트가 다시 이 화면으로 보내 무한 루프가 된다 — 그래서 끊고 알린다.
    console.error("[onboarding/consent] 동의 기록 실패", error);
    return {
      ok: false,
      message:
        "동의를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요. 계속 안 되면 문의해 주세요.",
    };
  }

  return { ok: true };
}
