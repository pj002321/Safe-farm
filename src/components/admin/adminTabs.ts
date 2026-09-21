import { isTabActive } from "@/components/shared/appTabs";

/**
 * ---------------------------------------------
 * [Feature]: 관리자 메뉴 7개 — 단일 출처
 *
 * [Description]
 * - 관리자 셸의 메뉴 줄(`AdminNav`)이 보는 목록. 기능정의서의 여섯 그룹에
 *   이미 있던 API 문서를 더해 일곱이다. 화면을 추가·삭제하면 **여기만** 고친다.
 * - 순서가 곧 화면 순서다. 정의서 순서(개요 → 배치 → 작물 → 품질 → 예측 → 회원)를
 *   따르고 API 문서는 맨 뒤에 둔다 — 운영 메뉴가 아니라 참고 자료라서다.
 * - 지시자가 없는 평범한 모듈이다. 서버·클라이언트 양쪽에서 import 할 수 있어야
 *   한다(`appTabs.tsx` 와 같은 이유).
 * - `components/shared/appTabs.tsx` 와 **합치지 않는다.** 그쪽은 다섯 개가 상한인
 *   하단 독의 목록이고, 이쪽은 관리자에게만 보이는 목록이다. 성격이 다른 두 목록을
 *   한 파일에 두면 한쪽 제약(다섯 개)이 다른 쪽을 묶는다.
 *
 * [Usage]
 * ```tsx
 * import { ADMIN_TABS, isAdminTabActive } from "@/components/admin/adminTabs";
 * ```
 * ---------------------------------------------
 */

export interface AdminTab {
  href: string;
  labelKo: string;
}

export const ADMIN_TABS: readonly AdminTab[] = [
  { href: "/admin", labelKo: "개요" },
  { href: "/admin/batches", labelKo: "배치 관리" },
  { href: "/admin/crops", labelKo: "작물 마스터" },
  { href: "/admin/quality", labelKo: "품질 관리" },
  { href: "/admin/accuracy", labelKo: "예측 정확도" },
  { href: "/admin/members", labelKo: "회원 관리" },
  { href: "/admin/api-docs", labelKo: "API 문서" },
];

/**
 * 지금 보고 있는 화면이 이 탭인가.
 *
 * 하위 경로까지 현재 탭으로 치는 규칙은 `isTabActive` 와 같다. 다만 **개요(`/admin`)만은
 * 정확히 일치할 때만** 켠다 — 다른 여섯이 전부 `/admin/` 아래라, 하위 경로 규칙을
 * 그대로 두면 어느 화면에 있든 개요가 함께 켜진다.
 */
export function isAdminTabActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return isTabActive(pathname, href);
}
