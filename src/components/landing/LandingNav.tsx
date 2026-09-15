"use client";

import { type RefObject, useEffect, useRef, useState } from "react";
import { CloseIcon, LogoWordmark, MenuIcon } from "@/components/icons";
import { ButtonLink } from "@/components/shared/Button";
import { ThemeToggle } from "@/components/shared/ThemeToggle";

/**
 * ---------------------------------------------
 * [Feature]: 랜딩 상단 네비게이션
 *
 * [Description]
 * - 히어로가 밤하늘이라 최상단에서는 배경을 깔지 않고 흰 글자(`text-space-fg`)로 얹는다.
 * - **`sticky` 가 아니라 `fixed` 다.** sticky 는 흐름에서 자리를 차지하므로 헤더 뒤가
 *   히어로가 아니라 페이지 배경(`--bg`)이 된다. 다크에서는 `--bg` 가 밤하늘과 거의
 *   같아 티가 안 나지만, 라이트에서는 어두운 히어로 위에 흰 띠가 얹히고 그 위의
 *   흰 글자가 읽히지 않는다. fixed 로 띄워야 히어로가 화면 맨 위까지 닿는다.
 *   (히어로의 `pt-24` 가 헤더 높이를 비워 둔다.)
 *   스크롤이 8px 을 넘어가면 그 아래는 밝은 섹션이므로 그때 비로소 반투명 배경과
 *   경계선을 켠다. 처음부터 배경을 깔면 히어로의 우주가 잘려 보인다.
 * - 스크롤 리스너는 `passive` 로 붙인다. 여기서 preventDefault 를 할 일이 없고,
 *   passive 가 아니면 브라우저가 스크롤마다 핸들러 종료를 기다려 끊긴다.
 * - 앵커 이동 시 이 sticky 헤더가 섹션 제목을 가린다. **대상 섹션들은 각자
 *   `scroll-mt-24` 를 가진다는 전제**로 작성했다(#eyes · #plots · #sat · #my · #today).
 *   섹션을 추가할 때 그 클래스를 빠뜨리면 제목이 헤더 뒤로 숨는다.
 * - `#proof`(좌표가 틀리면) 는 페이지에는 있지만 **메뉴에는 넣지 않는다.** 데스크톱
 *   한 줄에 들어가는 항목이 다섯이 한계라, 앞뒤 섹션에서 스크롤로 닿는 쪽을 택했다.
 * - 모바일 시트는 스크린리더·키보드에서도 닫을 수 있어야 하므로 Escape 키와
 *   본문 스크롤 잠금, 열림 시 첫 링크 포커스 이동을 모두 처리한다.
 *
 * [Usage]
 * ```tsx
 * <LandingNav />
 * ```
 * ---------------------------------------------
 */

interface NavLink {
  href: string;
  label: string;
}

/** 랜딩의 섹션 순서와 같아야 한다. 여기만 고치면 데스크톱·모바일이 함께 따라온다. */
const NAV_LINKS: readonly NavLink[] = [
  { href: "#eyes", label: "무엇으로 보나" },
  { href: "#plots", label: "논·밭·과수" },
  { href: "#sat", label: "위성 관측 기록" },
  { href: "#my", label: "내 밭" },
  { href: "#today", label: "오늘의 값" },
];

const SHEET_ID = "landing-nav-sheet";

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const sync = () => setScrolled(window.scrollY > 8);
    sync(); // 새로고침으로 중간에서 시작하는 경우가 있다.
    window.addEventListener("scroll", sync, { passive: true });
    return () => window.removeEventListener("scroll", sync);
  }, []);

  useEffect(() => {
    if (!sheetOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSheetOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);

    // 시트 뒤의 본문이 같이 스크롤되면 닫았을 때 엉뚱한 위치에 가 있다.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    firstLinkRef.current?.focus();

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [sheetOpen]);

  return (
    // ⚠️ 시트를 **헤더 밖에** 둔다. 헤더는 스크롤하면 `backdrop-blur` 가 붙는데,
    //    `backdrop-filter` 는 하위 `fixed` 요소의 **기준 블록**이 된다(transform·
    //    filter 와 같다). 시트가 헤더 안에 있으면 `inset-0` 이 화면이 아니라 헤더
    //    박스로 잡혀 64px 짜리 띠로 접히고, 배경이 사라진 것처럼 보인다.
    //    실측: 스크롤 전 812px → 스크롤 후 64px(헤더 높이와 같음).
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 w-full transition-[background-color,border-color] duration-300 ease-out-expo ${
          scrolled
            ? "border-border border-b bg-bg/80 text-fg backdrop-blur-xl"
            : "border-transparent border-b text-space-fg"
        }`}
      >
        <nav
          aria-label="주요 메뉴"
          className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-6"
        >
          <a aria-label="Safe Farm AI 맨 위로" className="shrink-0" href="#top">
            <LogoWordmark />
          </a>

          <ul className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  className={`rounded-md px-3 py-2 text-sm transition-colors duration-200 ease-out-expo ${
                    scrolled
                      ? "text-fg-muted hover:bg-surface-2 hover:text-fg"
                      : "text-space-muted hover:text-space-fg"
                  }`}
                  href={link.href}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <div className="hidden sm:block">
              <ButtonLink href="/login" size="sm" variant="primary">
                로그인
              </ButtonLink>
            </div>
            <button
              aria-controls={SHEET_ID}
              aria-expanded={sheetOpen}
              aria-label="메뉴 열기"
              className={`inline-flex size-9 items-center justify-center rounded-md border text-base md:hidden ${
                scrolled ? "border-border" : "border-space-border"
              }`}
              onClick={() => setSheetOpen(true)}
              type="button"
            >
              <MenuIcon />
            </button>
          </div>
        </nav>
      </header>

      {sheetOpen && (
        <MobileSheet
          firstLinkRef={firstLinkRef}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </>
  );
}

/**
 * 전체화면 시트.
 *
 * 포커스 트랩 라이브러리를 들이지 않았다. 시트가 열리면 `inert` 없이도 화면에
 * 남는 요소가 시트 자신뿐이라(본문은 스크롤 잠금 + 시트가 전면을 덮음),
 * Escape 와 링크 클릭 두 경로만 확실히 열어 두는 것으로 충분하다.
 */
function MobileSheet({
  firstLinkRef,
  onClose,
}: {
  firstLinkRef: RefObject<HTMLAnchorElement | null>;
  onClose: () => void;
}) {
  return (
    <div
      aria-label="전체 메뉴"
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col bg-bg md:hidden"
      id={SHEET_ID}
      role="dialog"
    >
      <div className="flex h-16 items-center justify-between px-6">
        <LogoWordmark className="text-fg" />
        <button
          aria-label="메뉴 닫기"
          className="inline-flex size-9 items-center justify-center rounded-md border border-border text-base text-fg-muted"
          onClick={onClose}
          type="button"
        >
          <CloseIcon />
        </button>
      </div>

      <ul className="flex flex-col gap-1 px-6 py-4">
        {NAV_LINKS.map((link, index) => (
          <li key={link.href}>
            <a
              className="block rounded-md px-2 py-4 font-medium text-fg text-xl tracking-tight"
              href={link.href}
              onClick={onClose}
              ref={index === 0 ? firstLinkRef : undefined}
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>

      <div className="mt-auto border-border border-t p-6">
        <ButtonLink fullWidth href="/login" onClick={onClose} size="lg">
          로그인
        </ButtonLink>
      </div>
    </div>
  );
}
