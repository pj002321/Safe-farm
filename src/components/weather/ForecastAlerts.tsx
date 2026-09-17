import {
  AlertTriangleIcon,
  DropletIcon,
  SnowflakeIcon,
  SunIcon,
  ThermometerIcon,
} from "@/components/icons";
import type { ForecastAlert } from "@/features/weather/domain/forecastAlerts";

/**
 * ---------------------------------------------
 * [Feature]: 밭 예보 경고 묶음 — 카드 맨 위
 *
 * [Description]
 * - 판정은 하지 않는다. `buildForecastAlerts` 가 만든 것을 그리기만 한다.
 * - **카드 맨 위에 둔다.** 예전에는 서리 경고가 해당 날짜 줄 아래 붙어 있어서,
 *   닷새 뒤 서리를 보려면 표를 끝까지 내려야 했다. 위험은 찾아 나서는 것이
 *   아니라 먼저 보여야 한다.
 * - 경고가 없으면 **아무것도 그리지 않는다.** "이상 없음" 배너를 두면 매일 뜨는
 *   초록 줄이 되어, 정작 빨간 줄이 떴을 때의 무게가 사라진다.
 * - **위험(danger)만 본문을 따로 편다.** 다섯 장이 전부 두 단으로 펴지면 경고만
 *   428px 이 되어(실측) 카드를 열었을 때 숫자가 한 개도 안 보인다. 주의·참고는
 *   제목 줄에 이어 붙여 한 덩어리로 흐르게 한다.
 * ---------------------------------------------
 */

const ALERT_ICONS = {
  official: AlertTriangleIcon,
  frost: SnowflakeIcon,
  hot: SunIcon,
  cold: ThermometerIcon,
  water: DropletIcon,
} as const;

/** 톤별 색. 토큰만 쓴다 — 원시 hex 를 쓰면 다크 모드에서 깨진다. */
const TONE_CLASS = {
  danger: "border-unsuitable/40 bg-unsuitable/10 text-unsuitable",
  caution: "border-caution/40 bg-caution/10 text-caution",
  info: "border-info/40 bg-info/10 text-info",
} as const;

export function ForecastAlerts({ alerts }: { alerts: ForecastAlert[] }) {
  if (alerts.length === 0) return null;

  return (
    <ul className="flex flex-col gap-2">
      {alerts.map((alert) => {
        const Icon = ALERT_ICONS[alert.id];
        return (
          <li
            className={`flex gap-2.5 rounded-lg border px-3 py-2 ${TONE_CLASS[alert.tone]}`}
            key={alert.id}
          >
            <Icon className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0 text-xs leading-relaxed">
              <span className="font-semibold text-sm">{alert.titleKo}</span>
              {/* 본문은 읽기 쉬운 색으로 낮춘다 — 경고색 글자가 길게 이어지면
                  오히려 안 읽힌다. */}
              {alert.tone === "danger" ? (
                <p className="mt-0.5 text-fg-muted">{alert.bodyKo}</p>
              ) : (
                <span className="text-fg-muted"> — {alert.bodyKo}</span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
