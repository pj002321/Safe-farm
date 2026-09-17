import {
  CloudRainIcon,
  DropletIcon,
  SnowflakeIcon,
  SunIcon,
  WindIcon,
} from "@/components/icons";
import type { WorkDay } from "@/features/weather/domain/weekSplit";

/**
 * ---------------------------------------------
 * [Feature]: 평일 / 주말 작업 가능 여부
 *
 * [Description]
 * - 이 칸의 목적은 날씨를 알리는 것이 아니라 **야외 작업이 가능한지 판단**하게
 *   돕는 것이다(스펙). 그래서 숫자보다 `workableKo` 한 줄이 크게 붙는다.
 *   기온·강수확률만 나열하면 사용자가 매번 스스로 판단해야 한다.
 * - **평일/주말 전환은 JS 가 없다.** 라디오 하나와 `group-has-[…]` 로 CSS 가
 *   가른다(내 정보 화면의 구역 전환과 같은 방식). 서버 컴포넌트로 남을 수 있고,
 *   전환에 네트워크도 없다 — 두 구간 모두 같은 7일 응답에서 나오기 때문이다.
 *   ⚠️ display 유틸리티를 겨루게 하지 않는다. 한쪽은 기본 `hidden`,
 *      다른 쪽은 `group-has-[…]:block` 으로 특이도가 확실히 갈리게 둔다.
 * - 기온은 `tabular-nums` 로 자릿수를 고정한다. 날짜가 세로로 놓이는데 숫자 폭이
 *   흔들리면 줄이 어긋나 비교가 어려워진다.
 * ---------------------------------------------
 */

const ICONS = {
  sun: SunIcon,
  rain: CloudRainIcon,
  wind: WindIcon,
  frost: SnowflakeIcon,
} as const;

/** 아이콘 배경. 좋은 날은 눈에 안 띄게, 못 하는 날만 색이 있게. */
const ICON_TONE = {
  sun: "bg-caution/10 text-caution",
  rain: "bg-info/10 text-info",
  wind: "bg-fg-subtle/10 text-fg-muted",
  frost: "bg-info/10 text-info",
} as const;

/** 라디오 id. `group-has-[#…]` 선택자에 **리터럴로** 들어가므로 조립하지 않는다. */
const WEEKDAY_ID = "work-window-weekday";
const WEEKEND_ID = "work-window-weekend";

export function WorkWindow({
  weekdays,
  weekend,
}: {
  weekdays: readonly WorkDay[];
  weekend: readonly WorkDay[];
}) {
  return (
    <div className="group/work">
      <fieldset className="mb-3">
        <legend className="sr-only">평일과 주말 중 볼 구간</legend>
        {/* sr-only 지만 실제 포커스를 받으므로 키보드 화살표로 전환된다.
            ⚠️ 다만 **포커스 링은 여기 그리면 안 보인다.** sr-only 는 `clip-path:
               inset(50%)` 라 outline 까지 잘라낸다. 그래서 아래 라벨로 옮겨
               그린다 — `PlotWizardDock`·`meSections` 가 같은 이유로 쓰는 방식이다. */}
        <input
          className="sr-only"
          defaultChecked
          id={WEEKDAY_ID}
          name="__work_window"
          type="radio"
        />
        <input
          className="sr-only"
          id={WEEKEND_ID}
          name="__work_window"
          type="radio"
        />

        <div className="inline-flex rounded-lg border border-border p-1">
          <label
            className="inline-flex min-h-9 cursor-pointer items-center rounded-md px-3 font-medium text-fg-muted text-sm transition-colors duration-200 ease-out-expo group-has-[#work-window-weekday:checked]/work:bg-accent group-has-[#work-window-weekday:checked]/work:text-accent-on group-has-[#work-window-weekday:focus-visible]/work:outline group-has-[#work-window-weekday:focus-visible]/work:outline-2 group-has-[#work-window-weekday:focus-visible]/work:outline-ring group-has-[#work-window-weekday:focus-visible]/work:outline-offset-2"
            htmlFor={WEEKDAY_ID}
          >
            평일
          </label>
          <label
            className="inline-flex min-h-9 cursor-pointer items-center rounded-md px-3 font-medium text-fg-muted text-sm transition-colors duration-200 ease-out-expo group-has-[#work-window-weekend:checked]/work:bg-accent group-has-[#work-window-weekend:checked]/work:text-accent-on group-has-[#work-window-weekend:focus-visible]/work:outline group-has-[#work-window-weekend:focus-visible]/work:outline-2 group-has-[#work-window-weekend:focus-visible]/work:outline-ring group-has-[#work-window-weekend:focus-visible]/work:outline-offset-2"
            htmlFor={WEEKEND_ID}
          >
            주말
          </label>
        </div>
      </fieldset>

      <div className="hidden group-has-[#work-window-weekday:checked]/work:block">
        <DayList days={weekdays} emptyKo="예보 구간에 평일이 없습니다." />
      </div>
      <div className="hidden group-has-[#work-window-weekend:checked]/work:block">
        <DayList days={weekend} emptyKo="예보 구간에 주말이 없습니다." />
      </div>
    </div>
  );
}

function DayList({
  days,
  emptyKo,
}: {
  days: readonly WorkDay[];
  emptyKo: string;
}) {
  if (days.length === 0) {
    return (
      <p className="rounded-lg border border-border border-dashed px-4 py-3 text-fg-muted text-sm">
        {emptyKo}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {days.map((day) => {
        const Icon = ICONS[day.icon];
        return (
          <li
            className="rounded-lg border border-border bg-surface p-3"
            key={day.date}
          >
            <div className="flex items-center gap-3">
              <span
                className={`grid size-9 shrink-0 place-items-center rounded-full ${ICON_TONE[day.icon]}`}
              >
                <Icon />
              </span>

              <div className="min-w-0">
                <p className="truncate font-semibold text-fg text-sm">
                  {day.labelKo}
                  <span className="ml-1.5 font-mono text-fg-subtle text-xs">
                    {day.dateKo}
                  </span>
                </p>
                <p className="font-mono text-[0.8rem] text-fg-muted tabular-nums">
                  {day.tempMinC ?? "—"} – {day.tempMaxC ?? "—"}℃
                </p>
              </div>

              <div className="ml-auto shrink-0 text-right">
                <p className="inline-flex items-center gap-1 font-mono text-[0.8rem] text-fg tabular-nums">
                  <DropletIcon className="size-3.5 text-info" />
                  {day.rainChance ?? "—"}%
                </p>
                <p className="font-mono text-[0.68rem] text-fg-subtle tabular-nums">
                  {/* 0mm 와 "관측 없음"은 다른 사실이다. */}
                  {day.rainMm === null
                    ? "예보 없음"
                    : day.rainMm > 0
                      ? `${day.rainMm}mm`
                      : "강수 없음"}
                </p>
              </div>
            </div>

            {/* 강수확률 막대. 숫자와 같은 정보를 길이로도 준다. */}
            {day.rainChance !== null && (
              <div
                aria-hidden="true"
                className="mt-3 h-1 overflow-hidden rounded-full bg-surface-2"
              >
                <div
                  className="h-full rounded-full bg-info"
                  style={{ width: `${day.rainChance}%` }}
                />
              </div>
            )}

            <p className="mt-2.5 text-[0.82rem] text-fg leading-relaxed">
              {day.workableKo}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
