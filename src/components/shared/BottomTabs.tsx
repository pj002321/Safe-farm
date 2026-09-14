"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
 * [Feature]: 하단 고정 탭 5개 (모바일 우선)
 *
 * [Description]
 * - 정의서의 홈·지도·날씨·질문·내정보 다섯 개를 고정한다. 개수를 늘리지 않는다 —
 *   하단 탭은 엄지가 닿는 자리를 나누는 구조라 여섯 개부터 손가락 폭을 밑돈다.
 * - **모바일에만 띄운다**(`lg:hidden`). 넓은 화면에는 상단 헤더가 이미 있고,
 *   둘을 같이 두면 같은 이동을 두 군데서 제공해 어느 쪽이 현재 위치인지 흐려진다.
 * - `"use client"` 인 이유는 **현재 탭 표시** 하나 때문이다(`usePathname`).
 *   활성 표시가 없는 탭 바는 "지금 어디인가"를 알려주지 못해 제 역할을 못 한다.
 *   업무 로직은 없다.
 * - 활성 여부를 **색으로만** 알리지 않는다. 위쪽 짧은 막대가 형태로도 말하고,
 *   `aria-current="page"` 로 보조기기에도 전달된다.
 * - 안전 영역(`pb-[env(safe-area-inset-bottom)]`)을 준다. 아이폰 홈 인디케이터가
 *   탭을 덮으면 마지막 탭이 눌리지 않는다.
 * - ⚠️ 이 바가 화면 아래를 덮으므로, 감싸는 레이아웃이 본문에 아래 여백을
 *   줘야 한다. 없으면 페이지 마지막 요소가 탭에 가려 영영 안 보인다.
 *   그 여백 값은 `bottomTabsLayout.ts` 에 있다 — **여기 두면 안 된다.**
 *   이 파일은 `"use client"` 라, 서버 컴포넌트가 컴포넌트 아닌 값을 가져가면
 *   Next 가 스텁 함수로 바꿔 className 에 에러 문구가 박힌다(실제로 밟았다).
 *
 * [Usage]
 * ```tsx
 * <BottomTabs />   // (app) 레이아웃에서 한 번만
 * ```
 * ---------------------------------------------
 */

interface Tab {
  href: string;
  labelKo: string;
  icon: ReactNode;
}

const TABS: readonly Tab[] = [
  { href: "/dashboard", labelKo: "홈", icon: <GaugeIcon /> },
  { href: "/map", labelKo: "지도", icon: <MapIcon /> },
  { href: "/weather", labelKo: "날씨", icon: <SunIcon /> },
  { href: "/ask", labelKo: "질문", icon: <QuestionIcon /> },
  { href: "/me", labelKo: "내 정보", icon: <UserIcon /> },
];

export function BottomTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="주요 메뉴"
      className="fixed inset-x-0 bottom-0 z-40 border-border border-t bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto flex max-w-lg">
        {TABS.map((tab) => {
          // 하위 경로까지 현재 탭으로 친다(`/plots/new` 는 홈 탭 아래가 아니므로
          // 정확 일치 + 접두사 둘 다 본다). 경계를 `/` 로 끊어 `/mexico` 가
          // `/me` 탭을 켜는 일을 막는다.
          const active =
            pathname === tab.href || pathname.startsWith(`${tab.href}/`);

          return (
            <li className="flex-1" key={tab.href}>
              <Link
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-col items-center gap-1 py-2.5 text-[0.68rem] transition-colors duration-200 ${
                  active ? "text-accent" : "text-fg-subtle hover:text-fg-muted"
                }`}
                href={tab.href}
              >
                {/* 활성 표식. 색약 사용자에게도 현재 위치가 보이도록 형태로 남긴다. */}
                <span
                  aria-hidden="true"
                  className={`-translate-x-1/2 absolute top-0 left-1/2 h-0.5 w-8 rounded-full transition-colors ${
                    active ? "bg-accent" : "bg-transparent"
                  }`}
                />
                <span className="text-lg leading-none">{tab.icon}</span>
                {tab.labelKo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
