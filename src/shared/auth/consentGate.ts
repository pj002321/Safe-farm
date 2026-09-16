import "server-only";

import { redirect } from "next/navigation";
import { hasCompletedConsent, type Profile } from "./profile";
import { getCurrentProfile } from "./profileStore";
import { getViewer, type Viewer } from "./session";

/**
 * ---------------------------------------------
 * [Feature]: 동의 온보딩 게이트
 *
 * [Description]
 * - 약관·개인정보 동의가 없는 사용자를 `/onboarding/consent` 로 보낸다.
 *   생기는 이유는 **구글은 로그인과 가입을 구분하지 않기** 때문이다. 계정이 없는
 *   사람이 `/login` 의 구글 버튼을 누르면 동의 화면을 거치지 않고 계정이 만들어져
 *   `terms_agreed_at` 이 빈 채로 남는다. 그 사용자를 여기서 붙잡는다.
 * - `session.ts` 가 아니라 별도 파일인 이유: session 은 **"누구인가"** 만 답해야
 *   한다. 여기에 프로필 조회가 섞이면 권한 판정에 DB 왕복이 딸려 붙는다.
 * - **보안 경계가 아니다.** 레이아웃·페이지의 렌더 시점 검사라 Server Action 과
 *   Route Handler 에는 미치지 않는다(AGENTS.md 의 관리자 게이트와 같은 한계).
 *   동의가 전제인 기능이 생기면 그 액션 첫 줄에서 `requireConsent()` 를 부를 것.
 * - 프로필이 **null 일 수 있다.** 트리거가 돌기 전에 만들어진 계정이 그렇다.
 *   그 경우도 "동의 없음"으로 본다 — 없는 것을 있다고 보는 것보다 안전하다.
 *   동의 화면의 액션이 0건 갱신을 오류로 끊으므로 루프가 되지는 않는다.
 *
 * [Usage]
 * ```tsx
 * // 레이아웃에서
 * const { viewer, profile } = await requireConsentOrRedirect();
 *
 * // 동의가 전제인 Server Action 에서
 * await requireConsent();
 * ```
 * ---------------------------------------------
 */

/** 동의를 받는 화면. 게이트가 보내는 곳이자, 게이트를 적용하면 안 되는 경로다. */
export const CONSENT_GATE_PATH = "/onboarding/consent";

/**
 * 게이트를 **통과한** 결과.
 *
 * `profile` 이 `null` 이 아니다. 프로필이 없으면 동의 여부를 알 수 없으므로 두
 * 함수 모두 그 자리에서 보내거나 던지고, 여기까지 오지 않는다. 타입을 넓게 두면
 * 부르는 쪽마다 없는 경우를 한 번씩 더 다뤄야 하고, 그 분기는 영영 실행되지 않는
 * 죽은 코드가 된다.
 */
interface GateResult {
  viewer: Viewer;
  profile: Profile;
}

/**
 * 레이아웃·페이지 전용. 로그인하지 않았으면 `/login`, 동의가 없으면 동의 화면으로.
 *
 * ⚠️ `CONSENT_GATE_PATH` 자신에는 부르지 말 것. 자기 자신으로 리다이렉트해
 * 무한 루프가 된다. 그래서 동의 화면은 `(app)` 그룹 **바깥**에 둔다.
 */
export async function requireConsentOrRedirect(): Promise<GateResult> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const profile = await getCurrentProfile();
  if (!profile || !hasCompletedConsent(profile)) redirect(CONSENT_GATE_PATH);

  return { viewer, profile };
}

/**
 * Server Action 전용. 던진다.
 *
 * 동의가 전제인 기능(밭 등록·리포트 발송 등)의 액션 첫 줄에서 부른다.
 * 레이아웃 검사는 액션에 미치지 않는다.
 */
export async function requireConsent(): Promise<GateResult> {
  const viewer = await getViewer();
  if (!viewer) throw new Error("UNAUTHENTICATED");

  const profile = await getCurrentProfile();
  if (!profile || !hasCompletedConsent(profile)) {
    throw new Error("CONSENT_REQUIRED");
  }

  return { viewer, profile };
}
