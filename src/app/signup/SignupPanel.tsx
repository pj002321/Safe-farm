"use client";

import { useEffect, useRef, useState } from "react";
import { ConsentFields } from "@/components/auth/ConsentFields";
import {
  AuthDivider,
  GoogleSignInButton,
} from "@/components/auth/GoogleSignInButton";
import { StepIndicator } from "@/components/auth/StepIndicator";
import { ArrowRightIcon } from "@/components/icons";
import { Button } from "@/components/shared/Button";
import { type Consent, isConsentComplete } from "@/shared/auth/consent";
import { DEFAULT_AFTER_LOGIN } from "@/shared/auth/redirect";
import { SignupForm } from "./SignupForm";

/**
 * ---------------------------------------------
 * [Feature]: 회원가입 2단계 흐름
 *
 * [Description]
 * - 동의 항목·구글 버튼·이메일 폼을 한 화면에 세로로 쌓으면 모바일에서 화면이
 *   서너 번 넘어간다. 무엇부터 해야 할지도 보이지 않는다. 그래서 둘로 나눈다.
 * - **순서가 동의 → 계정인 이유는 법적 제약이다.** 구글 가입은 우리 화면을
 *   떠나는 순간 계정이 만들어지므로, 동의를 그 뒤로 미루면 동의 없이 생성된
 *   계정이 남는다. 이메일만 있었다면 순서를 뒤집어도 됐다.
 * - 동의 상태를 **여기 한 곳**에서 쥔다. 같은 동의가 구글 버튼과 이메일 폼을
 *   동시에 잠그고, 어느 쪽으로 가입하든 **같은 값이 기록**돼야 하기 때문이다.
 *   인증이 클라이언트로 내려온 지금은 이 값을 hidden input 이 아니라 함수 인자로
 *   그대로 넘긴다 — 폼 경계를 넘길 방법을 고민할 필요가 없어졌다.
 * - 단계를 라우트(`/signup?step=2`)로 나누지 않았다. 동의 상태가 서버 왕복을
 *   견디려면 쿼리스트링에 실어야 하는데, 그 값은 주소창에서 고칠 수 있어
 *   "2단계 주소로 바로 들어가 동의를 건너뛰는" 경로가 열린다.
 * - 버튼 비활성화는 **안내**다. 방어는 세션 라우트(`POST /api/auth/session`)가
 *   `isConsentComplete` 로 다시 한다 — 그 요청은 직접 보낼 수 있기 때문이다.
 *
 * [Usage]
 * ```tsx
 * <SignupPanel />
 * ```
 * ---------------------------------------------
 */

const STEPS = ["약관 동의", "계정 만들기"] as const;

const NO_CONSENT: Consent = {
  terms: false,
  privacy: false,
  location: false,
  marketing: false,
};

export function SignupPanel() {
  const [step, setStep] = useState<1 | 2>(1);
  const [consent, setConsent] = useState<Consent>(NO_CONSENT);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const ready = isConsentComplete(consent);

  // 단계가 바뀌면 새 단계의 제목으로 포커스를 옮긴다. 이게 없으면 스크린리더
  // 사용자는 화면이 통째로 바뀐 사실을 모른 채 이전 위치에 남는다.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const goToStep = (next: 1 | 2) => {
    setStep(next);
    // 상태 변경이 그려진 뒤에 포커스를 옮겨야 한다.
    requestAnimationFrame(() => headingRef.current?.focus());
  };

  return (
    <div className="mt-8 flex flex-col gap-6">
      {/* 별도의 "이전" 버튼 대신 지나온 단계를 눌러 돌아간다. 버튼을 하나
          더 두면 2단계 화면에서 눌러야 할 것이 늘어나 가입 행동이 묻힌다. */}
      <StepIndicator
        current={step}
        onSelect={(next) => goToStep(next as 1 | 2)}
        steps={STEPS}
      />

      <h2
        className="font-medium text-fg text-sm outline-none"
        ref={headingRef}
        tabIndex={-1}
      >
        {step === 1 ? "먼저 약관을 확인해 주세요" : "가입 방법을 선택해 주세요"}
      </h2>

      {step === 1 ? (
        <div className="flex flex-col gap-5">
          <ConsentFields consent={consent} onChange={setConsent} />

          <Button
            disabled={!ready}
            fullWidth
            iconEnd={<ArrowRightIcon />}
            onClick={() => goToStep(2)}
            size="lg"
          >
            다음
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <GoogleSignInButton
            consent={consent}
            disabled={!ready}
            next={DEFAULT_AFTER_LOGIN}
          />

          <AuthDivider />

          <SignupForm consent={consent} disabled={!ready} />
        </div>
      )}
    </div>
  );
}
