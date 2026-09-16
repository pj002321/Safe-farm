import { FieldIcon, HarvestIcon, UserIcon } from "@/components/icons";
import { ME_SECTIONS } from "./meSections";

/**
 * ---------------------------------------------
 * [Feature]: 마이페이지 왼쪽 구역 레일 (lg 이상)
 *
 * [Description]
 * - 넓은 화면에서만 나온다. 좁은 화면에서는 구역 셋이 그냥 세로로 쌓이므로
 *   갈아 끼울 것이 없다 — 네 줄짜리 계정 정보를 보려고 탭을 누르게 할 이유가 없다.
 * - 등록 마법사의 가로 레일을 세로로 눕힌 것이다. 같은 언어(테두리 + 옅은 면 +
 *   accent 글자)를 써서 이 앱에 패턴을 하나 더 만들지 않는다.
 * - 각 칸이 `<label>` 이라 누르면 숨은 라디오가 바뀌고, `group-has` 가 해당 패널만
 *   켠다. 라디오는 실제로 포커스를 받으므로 **키보드 화살표로 구역 이동**이
 *   공짜로 따라온다.
 * - `sticky` 로 붙여 둔다. 텃밭이 여럿이면 목록이 길어지는데, 스크롤하는 동안
 *   지금 어느 구역인지가 화면에서 사라지면 안 된다.
 *   ⚠️ `top-[4.5rem]` 은 sticky 헤더 높이에 맞춘 값이다. 헤더 padding 이나 글자
 *      크기를 바꾸면 **다시 재야 한다** — 눈대중으로 상수를 잡았다가 13.84px
 *      어긋났던 전례가 있다(`bottomTabsLayout.ts`).
 *
 * [Usage]
 * ```tsx
 * <MeRail />   // group/me 안에서
 * ```
 * ---------------------------------------------
 */

/** 구역 아이콘. `meSections.ts` 는 지시자 없는 모듈이라 JSX 를 들지 않는다. */
const ICONS: Record<string, React.ReactNode> = {
  "me-account": <UserIcon />,
  "me-plots": <FieldIcon />,
  "me-records": <HarvestIcon />,
};

export function MeRail() {
  return (
    <nav aria-label="내 정보 구역" className="hidden lg:block">
      <ol className="sticky top-[4.5rem] flex flex-col gap-1">
        {ME_SECTIONS.map((section) => (
          <li key={section.id}>
            <label
              className={`flex cursor-pointer items-center gap-2.5 rounded-lg border border-transparent px-3 py-2.5 font-medium text-fg-muted text-sm transition-colors duration-200 ease-out-expo hover:bg-surface-2 hover:text-fg ${section.rail}`}
              htmlFor={section.id}
            >
              <span aria-hidden="true" className="text-base leading-none">
                {ICONS[section.id]}
              </span>
              {section.labelKo}
            </label>
          </li>
        ))}
      </ol>
    </nav>
  );
}
