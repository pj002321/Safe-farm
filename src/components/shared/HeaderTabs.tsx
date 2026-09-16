"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_TABS, isTabActive } from "@/components/shared/appTabs";

/**
 * ---------------------------------------------
 * [Feature]: 데스크톱 헤더의 탭 5개
 *
 * [Description]
 * - 넓은 화면에는 주요 메뉴가 **아예 없었다.** 하단 독이 `lg:hidden` 이라
 *   지도·날씨·질문·내정보로 갈 길이 데스크톱에서 끊겨 있었다.
 * - 세그먼트 컨트롤 모양이다. 트랙 하나에 알약 다섯을 담고 현재 탭만 떠오른다.
 *   헤더에 링크를 나열하는 방식보다 **"다섯 중 하나"라는 관계**가 드러나고,
 *   활성 표시가 배경 면이라 글자색만 바꾸는 것보다 멀리서도 읽힌다.
 * - 활성 표시를 색으로만 하지 않는다. 떠오른 면(bg-surface + 그림자)이 형태로
 *   말하고, `aria-current="page"` 가 보조기기에 전달한다.
 * - 좁은 화면에서는 숨긴다(`lg` 미만). 하단 독이 같은 일을 하는데 둘을 같이 두면
 *   같은 이동을 두 군데서 제공해 현재 위치가 흐려진다.
 * - `"use client"` 인 이유는 **현재 탭 표시** 하나 때문이다(`usePathname`).
 *   업무 로직은 없다.
 *
 * [Usage]
 * ```tsx
 * <header><HeaderTabs /></header>
 * ```
 * ---------------------------------------------
 */

export function HeaderTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="주요 메뉴" className="hidden lg:block">
      {/* 트랙. 살짝 가라앉은 면 위에 알약이 떠오르는 대비를 만든다. */}
      <ul className="flex items-center gap-0.5 rounded-full border border-border bg-surface-2/70 p-1 backdrop-blur">
        {APP_TABS.map((tab) => {
          const active = isTabActive(pathname, tab.href);

          return (
            <li key={tab.href}>
              <Link
                aria-current={active ? "page" : undefined}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-medium text-[0.82rem] transition-[background-color,color,box-shadow] duration-200 ease-out-expo ${
                  active
                    ? "bg-surface text-accent shadow-e1"
                    : "text-fg-muted hover:text-fg"
                }`}
                href={tab.href}
              >
                <span className="text-base leading-none">{tab.icon}</span>
                {tab.labelKo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
