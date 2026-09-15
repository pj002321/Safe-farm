import Link from "next/link";
import { ArrowRightIcon, CloseIcon, MenuIcon } from "@/components/icons";
import { APP_TABS } from "@/components/shared/appTabs";

/**
 * ---------------------------------------------
 * [Feature]: 텃밭 등록 마법사의 모바일 하단 독 (단계 ↔ 메뉴 변신)
 *
 * [Description]
 * - 예전에는 화면 아래에 **막대가 둘** 쌓였다. 흐름 안의 `WizardNav` 한 줄과 그
 *   위에 떠 있는 `BottomTabs` 독이다. 게다가 실측하면 이동 버튼이 **모든 단계에서
 *   첫 화면 밖 213px 아래**에 있었다(375x812). 다음을 누르려면 매번 스크롤해야 했다.
 * - 그래서 **독 하나로 합쳤다.** 등록 중에는 독이 단계 조작(이전 · 진행 · 다음)을
 *   맡고, 오른쪽 끝 버튼을 누르면 원래의 탭 5개로 바뀐다. 화면 아래 한 층만 쓴다.
 * - 이 독이 `fixed` 라 **흐름에서 빠지므로**, 모바일에서는 패널 높이를 고정할
 *   이유가 사라졌다. 예전에는 버튼이 패널 아래에 붙어 있어서 `min-h-[38rem]` 로
 *   높이를 맞춰야 했고, 그 탓에 1단계에서 **빈 칸 127px** 를 스크롤해야 했다.
 * - **JS 를 한 줄도 쓰지 않는다.** 이 마법사 전체가 라디오 + `group-has` 로 도는데
 *   독만 상태를 들고 있으면 같은 상태가 두 곳에 생긴다. 단계는 폼 안의 라디오를
 *   그대로 읽고, 메뉴 열림은 이름 없는 체크박스 하나가 들고 있다.
 *
 * - ⚠️ **`/wizard` 그룹은 폼이 아니라 폼의 부모 div 에 있다.** 이 독은 `<form>`
 *   **밖**에 있어야 하는데(아래 참고) `group-has` 는 조상에서 내려다보는 방식이라,
 *   폼과 독을 **함께 감싸는 div** 가 그룹을 들어야 양쪽이 같은 라디오를 본다.
 *   폼 밖에 두는 이유:
 *     · `fixed` 요소가 `backdrop-filter` 를 가진 조상 안에 들어가면 그 조상이
 *       **기준 블록**이 되어 독이 조상 크기로 찌그러진다(랜딩 햄버거에서 실측).
 *     · 체크박스가 폼 밖이라 제출 값에 절대 섞이지 않는다.
 * - ⚠️ 그래서 제출 버튼은 폼 밖에 있다. `form` 속성으로 잇는다 — 이게 없으면
 *   버튼의 form 소유자가 `null` 이라 **아무 일도 없이 조용히 제출이 안 된다.**
 *   (이전/다음/눈금은 `<label for>` 라서 이 속성이 필요 없다. 라벨은 폼 경계와
 *   무관하게 id 로 연결된다.)
 * - ⚠️ 클래스를 **반복문으로 만들 수 없다.** Tailwind 는 클래스 문자열을 정적으로
 *   읽으므로 `group-has-[#wizard-${n}:checked]` 같은 조립은 생성되지 않고 조용히
 *   사라진다. 그래서 네 벌을 **리터럴로** 적는다.
 * - ⚠️ **display 유틸리티 두 개를 겨루게 하지 말 것.** `hidden` 과
 *   `group-has-[…]:flex` 는 특이도가 달라서(:has 안의 id 가 계산된다) 안전하지만,
 *   `group-has` 끼리 붙이면 특이도가 같아 **Tailwind 의 정렬 순서**가 승자를
 *   정한다 — 클래스를 적은 순서가 아니다. 실측으로 확인했다.
 * - 숨김을 `opacity` 로만 하지 않고 `invisible` 을 함께 쓴다. 투명하기만 하면
 *   링크 5개가 **탭 순서와 접근성 트리에 그대로 남아서**, 폼을 채우던 사람이
 *   보이지 않는 링크로 화면을 떠나게 된다. `visibility:hidden` 이라야 빠진다.
 *
 * [Usage]
 * ```tsx
 * <div className="group/wizard">
 *   <form id="plot-form">…</form>
 *   <PlotWizardDock formId="plot-form" />
 * </div>
 * ```
 * ---------------------------------------------
 */

/** 이 독이 떠 있으면 공용 하단 독이 비켜선다. `(app)/layout.tsx` 와 아는 약속이다. */
export const PLOT_DOCK_ID = "plot-dock";

/** 메뉴 열림 상태. 이름이 없어야 폼에 안 실린다(어차피 폼 밖이지만 이중으로 막는다). */
const MENU_ID = "dock-menu";

/**
 * 단계별 한 줄. 네 벌을 다 렌더해 두고 현재 것만 켠다.
 * `show` 는 **완성된 클래스 문자열**이어야 한다(위 주석 참고).
 */
const ROWS = [
  {
    no: 1,
    ko: "위치 지정",
    show: "hidden group-has-[#wizard-1:checked]/wizard:flex",
    prevId: null,
    prevKo: null,
    next: { id: "wizard-2", ko: "다음" },
  },
  {
    no: 2,
    ko: "텃밭 정보",
    show: "hidden group-has-[#wizard-2:checked]/wizard:flex",
    prevId: "wizard-1",
    prevKo: "위치 지정",
    next: { id: "wizard-3", ko: "다음" },
  },
  {
    no: 3,
    ko: "작물 선택",
    show: "hidden group-has-[#wizard-3:checked]/wizard:flex",
    prevId: "wizard-2",
    prevKo: "텃밭 정보",
    next: { id: "wizard-4", ko: "다음" },
  },
  {
    no: 4,
    ko: "재배 정보",
    show: "hidden group-has-[#wizard-4:checked]/wizard:flex",
    prevId: "wizard-3",
    prevKo: "작물 선택",
    next: null,
  },
] as const;

/** 독 위 가장자리의 진행 막대. 네 너비 중 현재 단계 하나만 맞는다. */
const FILL =
  "group-has-[#wizard-1:checked]/wizard:w-1/4 group-has-[#wizard-2:checked]/wizard:w-2/4 group-has-[#wizard-3:checked]/wizard:w-3/4 group-has-[#wizard-4:checked]/wizard:w-full";

/** 메뉴가 열리면 사라지는 층(단계 조작). */
const HIDE_ON_MENU =
  "group-has-[#dock-menu:checked]/wizard:invisible group-has-[#dock-menu:checked]/wizard:translate-y-1 group-has-[#dock-menu:checked]/wizard:opacity-0";

/** 메뉴가 열려야 나타나는 층(탭 5개). */
const SHOW_ON_MENU =
  "-translate-y-1 invisible opacity-0 group-has-[#dock-menu:checked]/wizard:visible group-has-[#dock-menu:checked]/wizard:translate-y-0 group-has-[#dock-menu:checked]/wizard:opacity-100";

/**
 * 두 층을 같은 칸에 겹쳐 둔다. 높이가 층에 따라 변하면 독이 들썩인다.
 * 전환에 `delay-*` 를 쓰지 않는다 — 모션 최소화 설정에서 duration 만 죽고 delay 는
 * 남아, 컨트롤이 아예 사라진 빈 구간이 생긴다(globals.css 의 구멍).
 */
const LAYER =
  "[grid-area:1/1] flex items-center transition-[opacity,transform,visibility] duration-300 ease-out-expo";

const TAP =
  "grid size-11 shrink-0 place-items-center rounded-2xl transition-colors duration-200 ease-out-expo active:bg-surface-2";

export function PlotWizardDock({ formId }: { formId: string }) {
  return (
    <>
      {/*
        메뉴 열림 상태. sr-only 지만 **실제로 포커스를 받는 컨트롤**이라 키보드에서
        Space 로 열고 닫힌다. 라벨은 그림일 뿐이다.
        `aria-expanded` 를 쓰지 않는다 — JS 없이 갱신할 수 없어 반드시 거짓말이 된다.
        대신 checked 자체가 상태이고, 이름은 **두 상태 모두에서 참**인 말로 적는다.
      */}
      <input
        aria-label="메뉴 보기"
        className="sr-only"
        id={MENU_ID}
        type="checkbox"
      />

      <div
        className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden"
        id={PLOT_DOCK_ID}
      >
        <div className="relative mx-auto max-w-md overflow-hidden rounded-[1.75rem] bg-bg/70 shadow-e3 ring-1 ring-fg/10 ring-inset backdrop-blur-2xl">
          {/* 진행 막대. 독 자체가 진행률을 말하므로 본문에 또 그릴 필요가 없다. */}
          <span
            aria-hidden="true"
            className="absolute inset-x-0 top-0 block h-0.5 bg-fg/10"
          >
            <span
              className={`block h-full rounded-full bg-accent transition-[width] duration-500 ease-out-expo ${FILL}`}
            />
          </span>

          <div className="grid p-2 pr-14">
            {/* ── 층 1: 단계 조작 ───────────────────────── */}
            <nav
              aria-label="등록 단계 이동"
              className={`${LAYER} ${HIDE_ON_MENU}`}
            >
              {ROWS.map((row) => (
                <div
                  className={`${row.show} w-full items-center gap-2`}
                  key={row.no}
                >
                  {row.prevId ? (
                    <label
                      aria-label={`이전 단계: ${row.prevKo}`}
                      className={`${TAP} cursor-pointer text-fg-muted`}
                      htmlFor={row.prevId}
                    >
                      <ArrowRightIcon className="rotate-180 text-lg" />
                    </label>
                  ) : (
                    // 1단계엔 이전이 없다. 자리는 남겨야 가운데 글자가 안 움직인다.
                    <span aria-hidden="true" className="size-11 shrink-0" />
                  )}

                  {/*
                    눈금이 아니라 글자를 둔 이유: 점 4개는 지름 6px 라 누를 수 있는
                    물건처럼 보이지만 44px 타깃이 절대 안 나온다. 단계 건너뛰기는
                    넓은 화면의 레일이 맡고, 좁은 화면에서는 **지금 어디인지**만
                    분명히 말한다. 위 진행 막대가 같은 말을 그림으로 한 번 더 한다.
                  */}
                  <span className="flex min-w-0 flex-1 items-center justify-center gap-1.5">
                    <span className="font-mono text-fg-subtle text-xs tabular-nums">
                      {row.no}/4
                    </span>
                    <span className="truncate font-medium text-fg text-sm">
                      {row.ko}
                    </span>
                  </span>

                  {row.next ? (
                    <label
                      className="flex h-11 shrink-0 cursor-pointer items-center gap-1 rounded-2xl bg-accent px-4 font-medium text-accent-on text-sm transition-colors duration-200 ease-out-expo active:bg-accent-hover"
                      htmlFor={row.next.id}
                    >
                      {row.next.ko}
                      <ArrowRightIcon />
                    </label>
                  ) : (
                    <button
                      className="flex h-11 shrink-0 items-center gap-1 rounded-2xl bg-accent px-4 font-medium text-accent-on text-sm transition-colors duration-200 ease-out-expo active:bg-accent-hover"
                      form={formId}
                      type="submit"
                    >
                      등록하기
                      <ArrowRightIcon />
                    </button>
                  )}
                </div>
              ))}
            </nav>

            {/* ── 층 2: 원래의 탭 5개 ───────────────────── */}
            <nav
              aria-label="주요 메뉴"
              className={`${LAYER} ${SHOW_ON_MENU} justify-between`}
            >
              {APP_TABS.map((tab) => (
                <Link
                  className="flex flex-1 flex-col items-center gap-1 rounded-2xl py-2 text-[0.66rem] text-fg-subtle transition-colors duration-200 ease-out-expo active:bg-surface-2"
                  href={tab.href}
                  key={tab.href}
                >
                  <span className="text-lg leading-none">{tab.icon}</span>
                  {tab.labelKo}
                </Link>
              ))}
            </nav>
          </div>

          {/*
            변신 버튼. 두 층 **밖**에 있어야 어느 모드에서도 사라지지 않는다.
            포커스 링은 sr-only 체크박스에는 안 보이므로 여기로 옮겨 그린다.
          */}
          <label
            aria-hidden="true"
            className={`${TAP} absolute top-2 right-2 cursor-pointer text-fg-muted outline-ring outline-offset-2 group-has-[#dock-menu:focus-visible]/wizard:outline group-has-[#dock-menu:focus-visible]/wizard:outline-2`}
            htmlFor={MENU_ID}
          >
            <MenuIcon className="text-lg group-has-[#dock-menu:checked]/wizard:hidden" />
            <CloseIcon className="hidden text-lg group-has-[#dock-menu:checked]/wizard:block" />
          </label>
        </div>
      </div>
    </>
  );
}
