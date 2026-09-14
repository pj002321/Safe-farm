"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthError } from "@/components/auth/AuthError";
import { ConsentFields } from "@/components/auth/ConsentFields";
import { ArrowRightIcon } from "@/components/icons";
import { Button } from "@/components/shared/Button";
import { type Consent, isConsentComplete } from "@/shared/auth/consent";
import { DEFAULT_AFTER_LOGIN } from "@/shared/auth/redirect";
import { submitConsent } from "./actions";

/**
 * ---------------------------------------------
 * [Feature]: 온보딩 동의 폼
 *
 * [Description]
 * - 가입 화면과 **같은 `ConsentFields`** 를 쓴다. 항목·문구·전문 링크가 한 벌이어야
 *   "가입 때 본 것과 다른 약관에 동의했다"는 상황이 생기지 않는다.
 * - 성공하면 `router.refresh()` 를 **반드시** 부른다. 게이트는 서버 컴포넌트에서
 *   프로필을 읽어 판정하는데, 새로고침하지 않으면 캐시된 옛 프로필(동의 없음)을
 *   계속 보고 다시 이 화면으로 돌려보낸다.
 * - `replace` 를 쓴다(`push` 아님). 뒤로 가기로 동의 화면에 되돌아와도 의미가
 *   없고, 이미 동의한 사용자는 페이지가 알아서 대시보드로 보낸다.
 * - 여기의 비활성화는 **안내일 뿐 방어가 아니다.** 판정은 서버 액션이 다시 한다.
 * - 액션 호출을 try/catch 로 감싼다. `requireUser()` 는 값이 아니라 **예외로**
 *   거절하므로, 감싸지 않으면 `pending` 이 true 로 굳어 버튼이 영원히 "저장 중"이
 *   된다. 이 화면은 앱으로 가는 유일한 통로라 그 상태가 곧 완전한 잠금이다.
 *
 * [Usage]
 * ```tsx
 * <ConsentGateForm />
 * ```
 * ---------------------------------------------
 */

const NO_CONSENT: Consent = { terms: false, privacy: false, marketing: false };

export function ConsentGateForm() {
  const [consent, setConsent] = useState<Consent>(NO_CONSENT);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const ready = isConsentComplete(consent);

  const handleSubmit = async () => {
    if (pending || !ready) return;
    setPending(true);
    setError(null);

    // ⚠️ 액션은 **던질 수 있다.** `requireUser()` 가 세션 없음을 던지고, 네트워크가
    //    끊겨도 여기로 온다. 잡지 않으면 setPending(false) 에 닿지 못해 버튼이
    //    "저장 중"으로 굳고, 사용자는 영문도 모른 채 아무것도 못 하게 된다.
    //    (실제로 검증 중에 이 상태를 만났다.)
    let result: Awaited<ReturnType<typeof submitConsent>>;
    try {
      result = await submitConsent(consent);
    } catch (cause) {
      console.error("[onboarding/consent] 제출 실패", cause);
      setError(
        "저장하지 못했습니다. 로그인이 풀렸을 수 있으니 새로고침 후 다시 시도해 주세요.",
      );
      setPending(false);
      return;
    }

    if (!result.ok) {
      setError(result.message);
      setPending(false);
      return;
    }

    // refresh() 가 없으면 게이트가 옛 프로필을 보고 여기로 되돌려보낸다.
    router.replace(DEFAULT_AFTER_LOGIN);
    router.refresh();
  };

  return (
    <div className="mt-8 flex flex-col gap-5">
      <AuthError message={error} />

      <ConsentFields consent={consent} onChange={setConsent} />

      <Button
        disabled={!ready}
        fullWidth
        iconEnd={<ArrowRightIcon />}
        loading={pending}
        onClick={handleSubmit}
        size="lg"
      >
        {pending ? "저장 중" : "동의하고 시작하기"}
      </Button>
    </div>
  );
}
