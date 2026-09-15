import type { ReactNode } from "react";
import {
  GaugeIcon,
  MapIcon,
  QuestionIcon,
  SunIcon,
  UserIcon,
} from "@/components/icons";

/**
 * ---------------------------------------------
 * [Feature]: 앱 주요 탭 5개 — 단일 출처
 *
 * [Description]
 * - 모바일 하단 독(`BottomTabs`)과 데스크톱 헤더 탭(`HeaderTabs`)이 **같은 목록**을
 *   본다. 두 벌로 두면 한쪽에만 탭을 추가했을 때 화면 크기에 따라 메뉴가 달라진다 —
 *   보는 사람은 자기 화면에서만 사라진 메뉴를 영영 못 찾는다.
 * - **개수를 늘리지 않는다.** 하단 독은 엄지가 닿는 자리를 나누는 구조라 여섯 개
 *   부터 손가락 폭을 밑돈다. 늘려야 하면 "더보기"를 만들고 다섯은 유지한다.
 * - 지시자가 없는 평범한 모듈이다. 서버·클라이언트 양쪽에서 import 할 수 있어야
 *   하는데, `"use client"` 파일에서 컴포넌트가 아닌 값을 내보내면 서버가 그것을
 *   스텁으로 받는다(bottomTabsLayout.ts 주석에 적힌 함정과 같은 이유).
 *
 * [Usage]
 * ```tsx
 * import { APP_TABS, isTabActive } from "@/components/shared/appTabs";
 * ```
 * ---------------------------------------------
 */

export interface AppTab {
  href: string;
  labelKo: string;
  icon: ReactNode;
}

export const APP_TABS: readonly AppTab[] = [
  { href: "/dashboard", labelKo: "홈", icon: <GaugeIcon /> },
  { href: "/map", labelKo: "지도", icon: <MapIcon /> },
  { href: "/weather", labelKo: "날씨", icon: <SunIcon /> },
  { href: "/ask", labelKo: "질문", icon: <QuestionIcon /> },
  { href: "/me", labelKo: "내 정보", icon: <UserIcon /> },
];

/**
 * 지금 보고 있는 화면이 이 탭인가.
 *
 * 하위 경로까지 현재 탭으로 친다. 경계를 `/` 로 끊는 것이 요점이다 —
 * 단순 `startsWith` 면 `/mexico` 가 `/me` 탭을 켠다.
 */
export function isTabActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
