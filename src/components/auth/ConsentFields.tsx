"use client";

import { Checkbox } from "@/components/shared/Checkbox";
import {
  CONSENT_ITEMS,
  type Consent,
  isConsentComplete,
} from "@/shared/auth/consent";

/**
 * ---------------------------------------------
 * [Feature]: 가입 동의 항목 체크박스 묶음
 *
 * [Description]
 * - 항목 정의(`CONSENT_ITEMS`)는 `shared/auth/consent.ts` 가 가진다. 화면이
 *   목록을 따로 들고 있으면 서버 검증과 어긋나는 순간 동의 없이 가입이 뚫린다.
 * - **상태를 부모가 쥔다.** 이 동의는 이메일 폼과 구글 버튼을 동시에 잠그고,
 *   어느 경로로 가입하든 같은 값이 서버로 가야 한다. 그래서 여기서는 보이는
 *   체크박스만 그리고, 전송은 부모가 인증 함수의 인자로 한 번에 넘긴다.
 * - 요약은 `<details>` 로 그 자리에서 펼치고, **전문은 새 탭 링크**로 연다.
 *   요약만 보고 동의하게 두면 안 되고, 같은 탭으로 나가면 입력한 이메일·
 *   비밀번호가 날아가기 때문이다.
 * - "전체 동의"는 편의 장치일 뿐 법적 단위가 아니다. 개별 항목이 각각
 *   체크 가능해야 선택 항목(마케팅)을 거부할 수 있다.
 *
 * [Usage]
 * ```tsx
 * <ConsentFields consent={consent} onChange={setConsent} />
 * ```
 * ---------------------------------------------
 */

interface ConsentFieldsProps {
  consent: Consent;
  onChange: (next: Consent) => void;
}

export function ConsentFields({ consent, onChange }: ConsentFieldsProps) {
  const allChecked = CONSENT_ITEMS.every((item) => consent[item.key]);

  const toggleAll = (checked: boolean) => {
    onChange({ terms: checked, privacy: checked, marketing: checked });
  };

  return (
    <fieldset className="flex flex-col gap-4 rounded-lg border border-border bg-surface-2/50 p-4">
      <legend className="sr-only">약관 동의</legend>

      <Checkbox
        checked={allChecked}
        label={<span className="font-medium">약관에 전체 동의합니다</span>}
        name="agreeAll"
        onChange={(event) => toggleAll(event.target.checked)}
      />

      <div className="flex flex-col gap-4 border-border border-t pt-4">
        {CONSENT_ITEMS.map((item) => (
          <Checkbox
            badge={item.required ? "필수" : "선택"}
            checked={consent[item.key]}
            description={item.summary}
            key={item.key}
            label={item.label}
            name={item.key}
            onChange={(event) =>
              onChange({ ...consent, [item.key]: event.target.checked })
            }
          >
            <details className="mt-1.5">
              <summary className="w-fit cursor-pointer rounded-sm text-fg-muted text-xs underline underline-offset-4 transition-colors hover:text-fg">
                전문 보기
              </summary>
              <p className="mt-2 rounded-md border border-border bg-surface p-3 text-fg-muted text-xs leading-relaxed">
                {item.detail}
              </p>
            </details>

            {/* 요약만 보고 동의하게 두지 않는다. 전문으로 가는 길을 항상 연다.
                새 탭으로 여는 이유는 지금 화면의 입력(이메일·비밀번호)을
                잃지 않게 하려는 것이다. */}
            {item.href && (
              <a
                className="mt-1.5 inline-block text-accent text-xs underline underline-offset-4 transition-colors hover:text-accent-hover"
                href={item.href}
                rel="noreferrer"
                target="_blank"
              >
                전문 전체 보기 ↗
              </a>
            )}
          </Checkbox>
        ))}
      </div>

      {/*
        필수 항목이 빠졌을 때의 안내. 버튼을 막아 놓기만 하고 이유를 말해 주지
        않으면 사용자는 왜 눌리지 않는지 알 수 없다.
      */}
      {!isConsentComplete(consent) && (
        // <output> 은 role="status" 를 기본으로 가진다. div+role 조합보다
        // 보조기기 지원이 넓고 biome a11y/useSemanticElements 도 이쪽을 요구한다.
        <output className="text-fg-subtle text-xs">
          필수 항목에 동의하셔야 가입할 수 있습니다.
        </output>
      )}
    </fieldset>
  );
}
