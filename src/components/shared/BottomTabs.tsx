"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_TABS, isTabActive } from "@/components/shared/appTabs";

/**
 * ---------------------------------------------
 * [Feature]: 모바일 하단 독 (탭 5개)
 *
 * [Description]
 * - 목록은 `appTabs.tsx` 한 곳에서 온다. 데스크톱 헤더 탭과 같은 배열을 봐야
 *   화면 크기에 따라 메뉴가 달라지지 않는다.
 * - 가장자리에 붙은 막대에서 **떠 있는 독**으로 바꿨다. 양옆을 띄우고 모서리를
 *   둥글리면 본문 위에 얹힌 층이라는 것이 분명해지고, 화면 맨 아래 한 줄을
 *   통째로 먹는 인상이 줄어든다.
 * - **모바일에만 띄운다**(`lg:hidden`). 넓은 화면은 헤더 탭이 같은 일을 한다.
 *   둘을 같이 두면 같은 이동을 두 군데서 제공해 현재 위치가 흐려진다.
 * - 활성 여부를 **색으로만** 알리지 않는다. 아이콘 뒤의 알약이 형태로 말하고
 *   `aria-current="page"` 가 보조기기에 전달한다.
 * - 안전 영역을 준다(`max(0.75rem, env(safe-area-inset-bottom))`). 아이폰 홈
 *   인디케이터가 독을 덮으면 마지막 탭이 눌리지 않는다.
 * - `"use client"` 인 이유는 **현재 탭 표시** 하나 때문이다(`usePathname`).
 * - ⚠️ 이 독이 화면 아래를 덮으므로 감싸는 레이아웃이 본문에 아래 여백을 줘야
 *   한다. 그 값은 `bottomTabsLayout.ts` 에 있다 — **여기 두면 안 된다.**
 *   이 파일은 `"use client"` 라, 서버 컴포넌트가 컴포넌트 아닌 값을 가져가면
 *   Next 가 스텁 함수로 바꿔 className 에 에러 문구가 박힌다(실제로 밟았다).
 *
 * [Usage]
 * ```tsx
 * <BottomTabs />   // (app) 레이아웃에서 한 번만
 * ```
 * ---------------------------------------------
 */

export function BottomTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="주요 메뉴"
      className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden"
    >
      <ul className="mx-auto flex max-w-md items-center rounded-2xl border border-border bg-bg/85 p-1.5 shadow-e3 backdrop-blur-xl">
        {APP_TABS.map((tab) => {
          const active = isTabActive(pathname, tab.href);

          return (
            <li className="flex-1" key={tab.href}>
              <Link
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-1 rounded-xl py-1.5 text-[0.66rem] transition-[background-color,color] duration-200 ease-out-expo ${
                  active
                    ? "bg-accent-subtle text-accent"
                    : "text-fg-subtle hover:text-fg-muted"
                }`}
                href={tab.href}
              >
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
