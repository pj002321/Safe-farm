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
 * - **위험(danger)만 펴고 주의·참고는 접는다.** 다섯 장이 전부 펴지면 경고만
 *   468px 이 되어(실측) 카드를 열었을 때 숫자가 한 개도 안 보인다. 다만 접힌
 *   줄에 제목을 전부 흘려서, 펴지 않아도 무엇이 걸렸는지는 읽히게 한다 —
 *   건수만 적으면 접기가 위험을 감추는 장치가 된다.
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

  // 위험은 펴고 나머지는 접는다. 다섯 장을 전부 펴면 경고만 468px 이라 카드를
  // 열었을 때 숫자가 한 개도 안 보인다(실측). 위험은 구조상 최대 두 장이다
  // (기상특보 · 서리) — 그 둘의 **대처 문장**은 이 앱이 존재하는 이유라 접지 않는다.
  const danger = alerts.filter((a) => a.tone === "danger");
  const rest = alerts.filter((a) => a.tone !== "danger");

  return (
    <div className="flex flex-col gap-2">
      {danger.map((alert) => (
        <AlertBanner alert={alert} key={alert.id} />
      ))}

      {rest.length > 0 && (
        <details className="rounded-lg border border-border px-3 py-2">
          {/* ⚠️ 건수만 적지 않는다("주의 2건"). 그러면 접기가 위험을 감추는 장치가
              된다. 제목을 전부 흘려서, 펴지 않아도 무엇이 걸렸는지는 읽히게 한다. */}
          <summary className="cursor-pointer list-none text-fg-muted text-xs [&::-webkit-details-marker]:hidden">
            <span className="text-fg-subtle">주의·참고 {rest.length}건 — </span>
            {rest.map((a) => a.titleKo).join(" · ")}
          </summary>
          <ul className="mt-2 flex flex-col gap-2">
            {rest.map((alert) => (
              <AlertBanner alert={alert} key={alert.id} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function AlertBanner({ alert }: { alert: ForecastAlert }) {
  const Icon = ALERT_ICONS[alert.id];
  return (
    <div
      className={`flex gap-2.5 rounded-lg border px-3 py-2 ${TONE_CLASS[alert.tone]}`}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 text-xs leading-relaxed">
        <span className="font-semibold text-sm">{alert.titleKo}</span>
        {/* 본문은 읽기 쉬운 색으로 낮춘다 — 경고색 글자가 길게 이어지면 안 읽힌다. */}
        <p className="mt-0.5 text-fg-muted">{alert.bodyKo}</p>
      </div>
    </div>
  );
}
