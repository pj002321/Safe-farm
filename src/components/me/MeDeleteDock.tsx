import Link from "next/link";
import { AlertTriangleIcon } from "@/components/icons";
import { APP_TABS } from "@/components/shared/appTabs";
import { PAGE_DOCK_ID } from "@/components/shared/pageDock";
import { ARM_NONE_ID, DELETE_FORM_ID } from "./meSections";

/**
 * ---------------------------------------------
 * [Feature]: 마이페이지 하단 독 (탭 ↔ 삭제 확인 변신)
 *
 * [Description]
 * - 평소에는 앱 탭 다섯이고, **텃밭 삭제를 겨냥하는 순간 확인 바로 바뀐다.**
 *   등록 마법사의 독(`PlotWizardDock`)과 같은 기계다 — 층 둘을 같은 칸에 겹쳐
 *   두고 CSS `:has()` 로 갈아 끼운다. **JS 는 0줄.**
 *
 * - 마법사와 달리 **사용자가 무언가를 눌러 변신시키지 않는다.** 하는 일(삭제
 *   겨냥)이 독을 바꾼다. 설정 화면에서 "지금 위험한 상태"를 엄지 자리에 계속
 *   붙여 두는 것이 이 독의 존재 이유다 — 목록이 길면 겨냥한 줄이 스크롤 밖으로
 *   나가는데, 그때도 취소와 삭제가 손 닿는 곳에 남는다.
 *
 * - ⚠️ **"몇 개"가 아니라 "하나라도"만 본다.** `group-has-[.arm:checked]/me:` 로
 *   클래스를 보는 이유가 이것이다. id 로 보면 밭마다 클래스가 달라져 Tailwind 가
 *   정적으로 읽지 못한다(조용히 사라진다). 밭이 몇 개든 클래스는 한 벌이다.
 * - ⚠️ **독은 밭 이름을 말할 수 없다.** 선택자로 이름을 꺼낼 방법이 없기 때문이다.
 *   그래서 이름은 겨냥한 줄(엄지 바로 위)에서 부르고, 독은 되돌릴 수 없다는
 *   사실만 반복한다. 확인이 서로 다른 두 자리에 있는 셈이라 제14조에도 맞는다.
 * - 숨김에 `invisible` 을 반드시 함께 쓴다. 투명하기만 하면 링크 다섯이 **탭
 *   순서와 접근성 트리에 남아**, 삭제를 확인하려던 사람이 화면을 떠나게 된다.
 * - `delay-*` 를 쓰지 않는다. 모션 최소화 설정에서는 `duration` 만 죽고 `delay` 는
 *   남아, 컨트롤이 아예 사라진 구간이 생긴다.
 *
 * [Usage]
 * ```tsx
 * // group/me 안, 폼 바깥에서 한 번만
 * <MeDeleteDock />
 * ```
 * ---------------------------------------------
 */

/** 겨냥됐을 때 사라지는 층(앱 탭). */
const HIDE_ON_ARM =
  "group-has-[.arm:checked]/me:invisible group-has-[.arm:checked]/me:translate-y-1 group-has-[.arm:checked]/me:opacity-0";

/** 겨냥돼야 나타나는 층(확인 바). */
const SHOW_ON_ARM =
  "-translate-y-1 invisible opacity-0 group-has-[.arm:checked]/me:visible group-has-[.arm:checked]/me:translate-y-0 group-has-[.arm:checked]/me:opacity-100";

const LAYER =
  "[grid-area:1/1] flex items-center transition-[opacity,transform,visibility] duration-300 ease-out-expo";

export function MeDeleteDock() {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden"
      id={PAGE_DOCK_ID}
    >
      <div className="relative mx-auto max-w-md overflow-hidden rounded-[1.75rem] bg-bg/70 shadow-e3 ring-1 ring-fg/10 ring-inset backdrop-blur-2xl">
        {/* 위험 상태를 색면 하나로도 말한다. 변신했다는 것이 멀리서 읽힌다. */}
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 block h-0.5 bg-transparent transition-colors duration-300 ease-out-expo group-has-[.arm:checked]/me:bg-unsuitable"
        />

        <div className="grid p-2">
          {/* ── 층 1: 평소의 앱 탭 ───────────────── */}
          <nav aria-label="주요 메뉴" className={`${LAYER} ${HIDE_ON_ARM}`}>
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

          {/* ── 층 2: 삭제 확인 ──────────────────── */}
          <div className={`${LAYER} ${SHOW_ON_ARM} gap-2`}>
            <span className="grid size-11 shrink-0 place-items-center text-unsuitable">
              <AlertTriangleIcon className="text-lg" />
            </span>
            <span className="min-w-0 flex-1 text-fg-muted text-xs leading-snug">
              되돌릴 수 없습니다
            </span>
            <label
              className="flex h-11 shrink-0 cursor-pointer items-center rounded-2xl px-4 font-medium text-fg-muted text-sm transition-colors duration-200 ease-out-expo active:bg-surface-2"
              htmlFor={ARM_NONE_ID}
            >
              취소
            </label>
            <button
              className="flex h-11 shrink-0 items-center rounded-2xl bg-unsuitable px-4 font-medium text-accent-on text-sm transition-opacity duration-200 ease-out-expo active:opacity-90"
              form={DELETE_FORM_ID}
              type="submit"
            >
              삭제합니다
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
