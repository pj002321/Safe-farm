import type { Metadata } from "next";
import { LegalDocumentView } from "@/components/legal/LegalDocumentView";
import { PRIVACY_POLICY } from "@/features/legal/domain/privacy";

/**
 * ---------------------------------------------
 * [Feature]: 개인정보처리방침
 *
 * [Description]
 * - 가입 화면의 동의 항목이 가리키는 전문이다. 로그인 없이 열려야 한다 —
 *   가입 **전에** 읽고 판단하는 문서이기 때문이다(proxy 의 공개 경로).
 * - 내용은 `features/legal/domain/privacy.ts` 에 데이터로 있다. 이 파일은 조립만 한다.
 *
 * [Usage]
 * ```
 * /privacy
 * ```
 * ---------------------------------------------
 */

export const metadata: Metadata = {
  title: "개인정보처리방침",
  description:
    "Safe Farm AI가 수집하는 개인정보 항목과 이용 목적, 보유 기간, 처리 위탁 현황을 안내합니다.",
};

export default function PrivacyPage() {
  return <LegalDocumentView document={PRIVACY_POLICY} />;
}
