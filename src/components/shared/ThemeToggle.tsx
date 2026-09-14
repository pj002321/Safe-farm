"use client";

import { useEffect, useState } from "react";
import { MoonModeIcon, SunIcon } from "@/components/icons";
import { THEME_STORAGE_KEY, type ThemeMode } from "@/shared/theme/theme";

/**
 * ---------------------------------------------
 * [Feature]: 라이트/다크 테마 토글 버튼
 *
 * [Description]
 * - 실제 테마 적용은 globals.css 의 `[data-theme]` 가 한다. 이 버튼이 하는 일은
 *   그 속성과 localStorage 를 바꾸는 것뿐이다. 색을 직접 만지지 않는다.
 * - **초기값을 서버에서 추측하지 않는다.** 서버는 사용자의 저장값도 OS 설정도 모른다.
 *   추측해서 그리면 하이드레이션 불일치(해 아이콘이 달로 튀는 현상)가 난다.
 *   그래서 마운트 전에는 같은 크기의 빈 버튼을 그려 레이아웃만 잡아 두고,
 *   마운트 후 DOM 속성 → OS 설정 순으로 실제 값을 읽는다.
 * - "system" 으로 되돌리는 UI 는 두지 않았다. 한 버튼에 3상태를 넣으면 다음 상태가
 *   무엇인지 예측할 수 없다. 되돌림이 필요해지면 설정 화면의 3선택 컨트롤로 낸다.
 *
 * [Usage]
 * ```tsx
 * <header><ThemeToggle /></header>
 * ```
 * ---------------------------------------------
 */

/** 두 상태의 버튼이 같은 자리를 차지해야 토글할 때 헤더가 흔들리지 않는다. */
const BUTTON_CLASS =
  "inline-flex size-9 items-center justify-center rounded-md border border-border text-base text-fg-muted transition-colors duration-200 ease-out-expo hover:bg-surface-2 hover:text-fg";

type AppliedTheme = Extract<ThemeMode, "light" | "dark">;

export function ThemeToggle() {
  // null = 아직 모름(마운트 전). 이 구분이 있어야 빈 자리를 그릴 수 있다.
  const [theme, setTheme] = useState<AppliedTheme | null>(null);

  useEffect(() => {
    const attribute = document.documentElement.getAttribute("data-theme");
    if (attribute === "light" || attribute === "dark") {
      setTheme(attribute);
      return;
    }
    // 속성이 없다 = "system". 지금 화면에 실제로 칠해진 쪽을 읽는다.
    setTheme(
      window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light",
    );
  }, []);

  if (theme === null) {
    return <span aria-hidden="true" className={BUTTON_CLASS} />;
  }

  const next: AppliedTheme = theme === "dark" ? "light" : "dark";
  const label = next === "dark" ? "다크 모드로 전환" : "라이트 모드로 전환";

  const toggle = () => {
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // theme.ts 와 같은 이유다. 사이트 데이터를 막은 브라우저에서는 localStorage 에
      // 접근하는 것만으로 SecurityError 가 난다. 저장만 실패하고 이번 세션의 테마 변경은
      // 그대로 유효해야 한다 — 증상 은폐가 아니라 브라우저 계약이다.
    }
    setTheme(next);
  };

  return (
    <button
      aria-label={label}
      className={BUTTON_CLASS}
      onClick={toggle}
      title={label}
      type="button"
    >
      {theme === "dark" ? <SunIcon /> : <MoonModeIcon />}
    </button>
  );
}
