import { SunIcon } from "@/components/icons";
import type { PlotForecast } from "@/shared/aiService/client";
import { hourMinuteOf } from "@/shared/utils/format";

/**
 * ---------------------------------------------
 * [Feature]: 오늘 해 뜸·해 짐 — `/weather` 밭 줄의 **접힌 요약 줄**
 *
 * [Description]
 * - **아침에 밭에 나갈 때 보는 값이다.** 기온·비만 보고 나갔다가 아직 어두우면
 *   헛걸음이고, 해 지는 때를 모르면 일을 언제 접을지 못 정한다.
 * - ⚠ **`<summary>` 안, 기온 왼쪽에 둔다.** 처음엔 펼친 자리(주간 밴드 아래)에
 *   뒀는데 그러면 줄을 펴야만 보인다 — "한눈에" 라는 목적이 사라진다. 닫힌
 *   `<details>` 는 `<summary>` 말고는 아무것도 그리지 않는다.
 * - 값이 없으면 줄 자체를 그리지 않는다 — "—:—" 는 읽을 것이 없는 자리다.
 * - 좁은 화면에서 자리가 모자라면 `truncate` 가 걸린 밭 이름이 먼저 잘린다.
 *   이 칸은 폭이 고정이라(`shrink-0`) 시각이 잘리는 일은 없다.
 *
 * ⚠ 서버가 "2026-09-19T06:19" 를 그대로 준다(open_meteo_client). 여기서 시각만
 *   자른다 — 날짜를 화면에 다시 적을 이유가 없다. 오늘 줄이기 때문이다.
 * ---------------------------------------------
 */

/** "2026-09-19T06:19" → "06:19". 형태가 다르면 null 이라 줄이 안 그려진다. */
export function SunTimes({ today }: { today: PlotForecast["days"][number] }) {
  const rise = hourMinuteOf(today.sunrise);
  const set = hourMinuteOf(today.sunset);
  if (rise === null && set === null) return null;

  return (
    <dl className="flex shrink-0 items-center gap-x-3 font-mono text-fg-muted text-xs tabular-nums">
      {rise && (
        <div className="flex items-center gap-1">
          <dt>
            <SunIcon aria-label="해 뜸" className="size-3.5 text-warn" />
          </dt>
          <dd>{rise}</dd>
        </div>
      )}
      {set && (
        <div className="flex items-center gap-1">
          <dt>
            {/* 같은 해 그림을 옅게 — 뜨는 해와 지는 해를 따로 그리면
                아이콘이 둘 늘고, 작게 그리면 구분도 안 된다 */}
            <SunIcon aria-label="해 짐" className="size-3.5 text-fg-subtle" />
          </dt>
          <dd>{set}</dd>
        </div>
      )}
    </dl>
  );
}
