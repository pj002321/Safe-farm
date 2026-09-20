import {
  CloudIcon,
  CloudRainIcon,
  SnowflakeIcon,
  SunIcon,
} from "@/components/icons";
import type { IconProps } from "@/components/icons/types";
import {
  type EntryWeather,
  hasWeather,
} from "@/features/cultivations/domain/timeline";
import { windDirectionKo } from "@/shared/growth/windText";

/**
 * ---------------------------------------------
 * [Feature]: 일지 한 줄에 붙는 그날 날씨 띠
 *
 * [Description]
 * - **저장할 때 박아 둔 값을 그대로 읽는다.** 여기서 다시 조회하지 않는다 —
 *   관측이 나중에 정정돼도 과거 일지는 그때 적은 값이어야 한다.
 * - **빈 칸은 빈 채로 그린다.** `0` 을 찍으면 "비가 안 왔다" 는 뜻이 되어, 못
 *   찾은 날과 안 온 날이 화면에서 같아진다. 칸이 전부 비면 띠 자체를 안 그린다.
 * - 아이콘과 풍향 말은 **이미 있는 것을 쓴다**(`components/icons/weather`,
 *   `shared/growth/windText`). 여기서 다시 그리거나 다시 계산하면 `/weather` 탭과
 *   같은 값이 다르게 보일 수 있다.
 * - `skyKo` 가 비면 그림을 안 그린다 — 우리 Open-Meteo 요청에 `weather_code` 가
 *   없어 맑음과 흐림을 가릴 수 없고, 짐작해 그리면 사용자가 고른 값과 섞인다.
 * - 서버 컴포넌트다. 상태도 브라우저 API 도 쓰지 않는다.
 * ---------------------------------------------
 */

/** 사용자가 고른 하늘 → 아이콘. 목록은 `domain/diaryFields.ts` 의 `SKY_KINDS`. */
const SKY_ICON: Record<string, (props: IconProps) => React.ReactElement> = {
  맑음: SunIcon,
  흐림: CloudIcon,
  비: CloudRainIcon,
  눈: SnowflakeIcon,
};

export function WeatherStrip({ weather }: { weather: EntryWeather | null }) {
  if (!hasWeather(weather) || weather === null) return null;

  const Icon = weather.skyKo === null ? undefined : SKY_ICON[weather.skyKo];
  // 글자는 **불어오는 쪽**이다. 화살표를 그릴 일이 없으므로 `windArrowDeg` 는 안 쓴다.
  const windKo = windDirectionKo(weather.windDirDeg);

  // 값이 있는 칸만 줄에 올린다. 없는 칸을 "—" 로 채우면 띠가 길어지기만 하고,
  // 0 으로 채우면 거짓말이 된다.
  const parts: string[] = [];
  if (weather.tempMaxC !== null || weather.tempMinC !== null) {
    parts.push(`${weather.tempMaxC ?? "—"} / ${weather.tempMinC ?? "—"} ℃`);
  }
  if (weather.rainfallMm !== null) parts.push(`비 ${weather.rainfallMm} mm`);
  if (weather.humidityPct !== null) parts.push(`습도 ${weather.humidityPct} %`);
  if (weather.windMs !== null) {
    parts.push(
      `바람 ${weather.windMs} m/s${windKo === null ? "" : ` ${windKo}`}`,
    );
  }
  if (weather.sunriseAt !== null && weather.sunsetAt !== null) {
    parts.push(`${weather.sunriseAt}–${weather.sunsetAt}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-surface-2 px-2.5 py-1.5 text-fg-muted text-xs tabular-nums">
      {weather.skyKo !== null && (
        <span className="flex items-center gap-1.5">
          {Icon && <Icon className="size-3.5" />}
          {weather.skyKo}
        </span>
      )}
      {parts.map((part) => (
        <span key={part}>{part}</span>
      ))}
    </div>
  );
}
