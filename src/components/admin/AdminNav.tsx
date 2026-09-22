"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_TABS, isAdminTabActive } from "@/components/admin/adminTabs";

/**
 * ---------------------------------------------
 * [Feature]: 관리자 셸의 메뉴 줄
 *
 * [Description]
 * - 모양은 `HeaderTabs` 와 같은 세그먼트 컨트롤이다. 관리자도 같은 사람이 쓰는
 *   화면이라 "여럿 중 하나" 를 읽는 방식이 달라지면 안 된다.
 * - `HeaderTabs` 와 다른 점 하나 — **좁은 화면에서 숨기지 않고 가로로 넘긴다.**
 *   사용자 셸은 하단 독이 같은 일을 하지만 관리자 셸에는 독이 없어, 숨기면
 *   좁은 화면에서 이동 경로가 통째로 사라진다.
 * - 활성 표시는 색만이 아니다. 떠오른 면(bg-surface + 그림자)이 형태로 말하고
 *   `aria-current="page"` 가 보조기기에 전달한다.
 * - `"use client"` 인 이유는 **현재 탭 표시** 하나 때문이다(`usePathname`).
 *   업무 로직은 없다.
 *
 * [Usage]
 * ```tsx
 * <AdminNav />
 * ```
 * ---------------------------------------------
 */
export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="관리자 메뉴" className="border-border border-b bg-surface">
      {/* 트랙이 칸보다 길어지면 페이지가 아니라 이 줄만 가로로 넘긴다. */}
      <div className="mx-auto max-w-5xl overflow-x-auto px-4 py-2">
        <ul className="flex w-max items-center gap-0.5 rounded-full border border-border bg-surface-2/70 p-1">
          {ADMIN_TABS.map((tab) => {
            const active = isAdminTabActive(pathname, tab.href);

            return (
              <li key={tab.href}>
                <Link
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex items-center whitespace-nowrap rounded-full px-3.5 py-1.5 font-medium text-[0.82rem] transition-[background-color,color,box-shadow] duration-200 ease-out-expo ${
                    active
                      ? "bg-surface text-accent shadow-e1"
                      : "text-fg-muted hover:text-fg"
                  }`}
                  href={tab.href}
                >
                  {tab.labelKo}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
