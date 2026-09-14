import type { Metadata } from "next";
import { LegalDocumentView } from "@/components/legal/LegalDocumentView";
import { TERMS_OF_SERVICE } from "@/features/legal/domain/terms";

/**
 * ---------------------------------------------
 * [Feature]: 서비스 이용약관
 *
 * [Description]
 * - 가입 화면의 동의 항목이 가리키는 전문이다. 로그인 없이 열려야 한다 —
 *   가입 **전에** 읽고 판단하는 문서이기 때문이다(proxy 의 공개 경로).
 * - 내용은 `features/legal/domain/terms.ts` 에 데이터로 있다. 이 파일은 조립만 한다.
 *
 * [Usage]
 * ```
 * /terms
 * ```
 * ---------------------------------------------
 */

export const metadata: Metadata = {
  title: "서비스 이용약관",
  description:
    "Safe Farm AI 리포트의 이용 조건과 책임 범위, 서비스의 한계를 안내합니다.",
};

export default function TermsPage() {
  return <LegalDocumentView document={TERMS_OF_SERVICE} />;
}
