/**
 * ---------------------------------------------
 * [Feature]: 7일 기상 차트용 계열 만들기 (순수)
 *
 * [Description]
 * - 일 최고·최저 기온 선과 강수량 막대를 한 차트에 겹치려면 **날짜 축이 하나로
 *   맞아야 한다.** 관측과 예보는 출처가 달라 빠지는 날이 제각각이라, 여기서 한
 *   줄로 세우고 없는 날은 없는 채로 둔다.
 * - **빈 날을 0 으로 메우지 않는다.** 0mm 는 "비가 안 왔다"이고 결측은 "모른다"
 *   인데, 메우면 차트가 둘을 같게 그린다. `tempMaxC: null` 이면 그 점은 안 찍고
 *   선은 건너뛴다(`toPolylinePoints` 가 이미 그렇게 한다).
 * - 예보 구간은 `source: "forecast"` 로 표시한다. 화면이 점선으로 그려 실측과
 *   구분한다 — 섞어 놓으면 사용자가 예보를 관측으로 읽는다.
 * - ⚠️ **지금 데이터가 얇다.** `weather_obs_daily` 는 행이 적고
 *   `weather_forecast` 는 적재하는 코드가 아직 없다. 그래서 계열이 거의 비는
 *   것이 정상이고, 화면은 그 상태를 "관측 없음"으로 그려야 한다.
 *
 * [Usage]
 * ```ts
 * const series = buildWeatherSeries({ today: "2026-09-17", days: 7, ... });
 * series.points.filter((p) => p.source === "forecast");
 * ```
 * ---------------------------------------------
 */

/** 관측 또는 예보 한 행. 둘이 같은 모양이라 하나로 받는다. */
export interface WeatherRow {
  /** `"YYYY-MM-DD"`. */
  date: string;
  tempMaxC: number | null;
  tempMinC: number | null;
  rainfallMm: number | null;
}

export type WeatherSource = "observed" | "forecast" | "none";

export interface WeatherPoint {
  date: string;
  /** 축 라벨에 쓰는 `"MM-DD"`. `chartScale.dateToNumber` 가 이 형식을 받는다. */
  monthDay: string;
  tempMaxC: number | null;
  tempMinC: number | null;
  rainfallMm: number | null;
  source: WeatherSource;
}

export interface WeatherSeries {
  points: readonly WeatherPoint[];
  /** 기온 축 범위. 값이 하나도 없으면 null — 화면이 차트 대신 빈 상태를 그린다. */
  tempDomain: { lo: number; hi: number } | null;
  /** 강수 막대의 최댓값. 하나도 없으면 null. */
  rainfallMax: number | null;
  /** 값이 실제로 있는 날 수. 0 이면 그릴 것이 없다. */
  filledDays: number;
}

export interface WeatherSeriesInput {
  /** 기준일 (`"YYYY-MM-DD"`). 호출자가 넘긴다. */
  today: string;
  /** 며칠치를 그릴지. */
  days: number;
  /** 기준일 이전 며칠을 관측으로 채울지. 나머지는 예보 자리다. */
  pastDays: number;
  observations: readonly WeatherRow[];
  forecast: readonly WeatherRow[];
}

const DAY_MS = 86_400_000;

function shiftDate(date: string, days: number): string {
  const stamp = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(stamp)) return date;
  return new Date(stamp + days * DAY_MS).toISOString().slice(0, 10);
}

/** 기온 축에 값 위아래로 두는 여유. 선이 상자에 딱 붙으면 읽기 어렵다. */
const TEMP_PADDING_C = 2;

/**
 * 날짜 축을 먼저 만들고 두 출처를 얹는다.
 *
 * 관측을 예보보다 우선한다. 지난 날짜에 예보가 남아 있어도 그건 이미 빗나갔을
 * 수 있는 값이고, 같은 날 관측이 있으면 그쪽이 사실이다.
 */
export function buildWeatherSeries(input: WeatherSeriesInput): WeatherSeries {
  const observed = new Map(input.observations.map((row) => [row.date, row]));
  const forecast = new Map(input.forecast.map((row) => [row.date, row]));

  const points: WeatherPoint[] = [];
  for (let offset = -input.pastDays; points.length < input.days; offset += 1) {
    const date = shiftDate(input.today, offset);
    const row = observed.get(date) ?? forecast.get(date) ?? null;
    const source: WeatherSource =
      row === null ? "none" : observed.has(date) ? "observed" : "forecast";

    points.push({
      date,
      monthDay: date.slice(5),
      tempMaxC: row?.tempMaxC ?? null,
      tempMinC: row?.tempMinC ?? null,
      rainfallMm: row?.rainfallMm ?? null,
      source,
    });
  }

  const temps = points.flatMap((point) =>
    [point.tempMaxC, point.tempMinC].filter(
      (value): value is number => value !== null,
    ),
  );
  const rains = points
    .map((point) => point.rainfallMm)
    .filter((value): value is number => value !== null);

  return {
    points,
    tempDomain:
      temps.length === 0
        ? null
        : {
            lo: Math.floor(Math.min(...temps)) - TEMP_PADDING_C,
            hi: Math.ceil(Math.max(...temps)) + TEMP_PADDING_C,
          },
    rainfallMax: rains.length === 0 ? null : Math.max(...rains),
    filledDays: points.filter((point) => point.source !== "none").length,
  };
}

/**
 * 최근 며칠을 한 줄로 요약한다. 추천 작업(`taskAdvice.ts`)이 받는 모양이다.
 *
 * 관측만 센다 — 예보로 "요즘 더웠다"고 말할 수는 없다. 값이 없는 날은 평균에서
 * 빼므로, 관측이 이틀뿐이면 `days` 도 2 다. 그 수를 보고 받는 쪽이 판정을
 * 건너뛸지 정한다.
 */
export function summarizeWeather(series: WeatherSeries): {
  days: number;
  avgTempMaxC: number;
  avgTempMinC: number;
  rainfallMm: number | null;
} | null {
  const observed = series.points.filter((p) => p.source === "observed");

  const maxes = observed
    .map((p) => p.tempMaxC)
    .filter((v): v is number => v !== null);
  const mins = observed
    .map((p) => p.tempMinC)
    .filter((v): v is number => v !== null);
  if (maxes.length === 0 || mins.length === 0) return null;

  const rains = observed
    .map((p) => p.rainfallMm)
    .filter((v): v is number => v !== null);

  return {
    days: Math.min(maxes.length, mins.length),
    avgTempMaxC:
      Math.round((maxes.reduce((a, b) => a + b, 0) / maxes.length) * 10) / 10,
    avgTempMinC:
      Math.round((mins.reduce((a, b) => a + b, 0) / mins.length) * 10) / 10,
    rainfallMm:
      rains.length === 0
        ? null
        : Math.round(rains.reduce((a, b) => a + b, 0) * 10) / 10,
  };
}
