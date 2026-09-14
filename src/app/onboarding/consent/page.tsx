import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { hasCompletedConsent } from "@/shared/auth/profile";
import { getCurrentProfile } from "@/shared/auth/profileStore";
import { DEFAULT_AFTER_LOGIN } from "@/shared/auth/redirect";
import { getViewer } from "@/shared/auth/session";
import { ConsentGateForm } from "./ConsentGateForm";

/**
 * ---------------------------------------------
 * [Feature]: 동의 온보딩  →  /onboarding/consent
 *
 * [Description]
 * - 동의 없이 계정이 만들어진 사용자를 붙잡는 화면. 구글은 로그인과 가입을
 *   구분하지 않아서, `/login` 의 구글 버튼으로 처음 들어온 사람은 동의 화면을
 *   거치지 않고 계정이 생긴다.
 * - ⚠️ **`(app)` 그룹 바깥에 둔다.** 그 그룹의 레이아웃이 동의 게이트를 걸고
 *   있어서, 이 화면을 안에 두면 자기 자신으로 리다이렉트해 무한 루프가 된다.
 *   미로그인 차단은 proxy 가 한다(공개 목록에 없는 경로라 자동으로 막힌다).
 * - 이미 동의한 사용자는 앱 홈으로 보낸다. 뒤로 가기로 돌아오거나 주소를 직접
 *   쳤을 때 이미 끝난 절차를 다시 보여줄 이유가 없다.
 * - **로그아웃 길을 남긴다.** 이 화면은 앱으로 가는 유일한 통로라, 동의하지
 *   않기로 한 사용자에게 빠져나갈 문이 없으면 계정에 갇힌다.
 * ---------------------------------------------
 */

export const metadata: Metadata = {
  title: "약관 동의",
  description: "서비스 이용에 필요한 약관에 동의해 주세요.",
};

export default async function ConsentOnboardingPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const profile = await getCurrentProfile();
  if (profile && hasCompletedConsent(profile)) redirect(DEFAULT_AFTER_LOGIN);

  return (
    <AuthShell
      description={`${viewer.email ?? "회원"}님, 서비스를 이용하시려면 아래 약관에 동의해 주세요.`}
      headline={
        <>
          한 가지만
          <br />
          확인하겠습니다
        </>
      }
      title="약관 동의"
      footer={
        <div className="mt-8 border-border border-t pt-6">
          <p className="text-fg-muted text-sm">
            동의하지 않으시면 서비스를 이용할 수 없습니다. 지금 계정을 두고
            나가시려면 로그아웃해 주세요.
          </p>
          <div className="mt-3">
            <SignOutButton size="sm" variant="outline" />
          </div>
        </div>
      }
    >
      <ConsentGateForm />
    </AuthShell>
  );
}
