import type { Metadata } from "next";
import { LegalDocumentView } from "@/components/legal/LegalDocumentView";
import { LOCATION_TERMS } from "@/features/legal/domain/location";

/**
 * ---------------------------------------------
 * [Feature]: 위치기반서비스 이용약관
 *
 * [Description]
 * - 가입 화면의 위치정보 동의 항목이 가리키는 전문이다. 로그인 없이 열려야 한다
 *   — 가입 **전에** 읽고 판단하는 문서이기 때문이다(proxy 의 공개 경로).
 * - 내용은 `features/legal/domain/location.ts` 에 데이터로 있다. 이 파일은 조립만 한다.
 *
 * [Usage]
 * ```
 * /location
 * ```
 * ---------------------------------------------
 */

export const metadata: Metadata = {
  title: "위치기반서비스 이용약관",
  description:
    "밭 좌표와 단말 현재 위치를 어떻게 수집·이용하고 얼마나 보관하는지 안내합니다.",
};

export default function LocationTermsPage() {
  return <LegalDocumentView document={LOCATION_TERMS} />;
}
