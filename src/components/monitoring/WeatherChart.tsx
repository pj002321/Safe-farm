import {
  type ChartBox,
  createScale,
  toPolylinePoints,
} from "@/features/monitoring/domain/chartScale";
import type { WeatherSeries } from "@/features/monitoring/domain/weatherSeries";

/**
 * ---------------------------------------------
 * [Feature]: 7일 기온·강수 차트 (인라인 SVG)
 *
 * [Description]
 * - `ObservationChart` 와 같은 방침이다. 라이브러리를 쓰지 않고
 *   `chartScale.ts` 의 좌표 변환만 빌린다. 색은 SVG 에 적지 않고 시맨틱 토큰
 *   유틸리티(`text-accent` 등)가 준다.
 * - **기온은 선, 강수는 막대**로 겹친다. 축이 둘(℃, mm)이라 강수는 따로 비율을
 *   잡아 아래쪽 1/3 만 쓴다. 눈금을 양쪽에 다 그리면 폭 좁은 화면에서 읽히지
 *   않아, 강수는 막대 끝에 숫자를 붙이는 쪽을 골랐다.
 * - **예보 구간은 점선**이다. 실측과 같은 선으로 그리면 사용자가 예보를 관측으로
 *   읽는다. 관측→예보로 넘어가는 자리에서 선을 끊지 않으려고 두 선이 경계 날짜를
 *   한 점씩 공유한다.
 * - 값이 없는 날은 **건너뛴다**. 0 으로 내려꽂으면 "비가 안 왔다"로 읽힌다.
 * - 서버 컴포넌트다. 상태도 브라우저 API 도 쓰지 않는다.
 * ---------------------------------------------
 */

export interface WeatherChartProps {
  series: WeatherSeries;
  /** 스크린리더용 한 문장. 그림만 있고 설명이 없으면 값이 사라진다. */
  summary: string;
  height?: number;
}

const BOX: Omit<ChartBox, "height"> = {
  width: 440,
  padding: { top: 12, right: 12, bottom: 26, left: 30 },
};

/** 강수 막대가 쓰는 세로 비율. 위쪽은 기온 선에 남긴다. */
const RAIN_AREA = 0.32;

/** 눈금 라벨을 몇 칸마다 찍을지. 7일이면 하루 걸러 하나다. */
const LABEL_EVERY = 2;

export function WeatherChart({
  series,
  summary,
  height = 200,
}: WeatherChartProps) {
  const domain = series.tempDomain;
  if (domain === null || series.filledDays === 0) {
    return (
      <p className="rounded-lg border border-border bg-surface-2 px-4 py-6 text-center text-fg-muted text-sm">
        아직 들어온 관측이 없습니다.
      </p>
    );
  }

  const box: ChartBox = { ...BOX, height };
  const dates = series.points.map((point) => point.monthDay);
  const scale = createScale(dates, domain, box);

  const baseY = height - box.padding.bottom;
  const rainTop =
    baseY - (height - box.padding.top - box.padding.bottom) * RAIN_AREA;
  const rainMax = series.rainfallMax ?? 0;

  // 관측과 예보를 따로 이어 점선을 나눈다. 경계 날짜는 양쪽에 다 넣어 선이
  // 끊긴 것처럼 보이지 않게 한다.
  const lines = (
    pick: (p: (typeof series.points)[number]) => number | null,
  ) => {
    const observed = series.points.filter((p) => p.source === "observed");
    const forecast = series.points.filter((p) => p.source === "forecast");
    const bridge = observed.at(-1);
    const joined = bridge ? [bridge, ...forecast] : forecast;
    const toPoints = (rows: typeof series.points) =>
      toPolylinePoints(
        rows.flatMap((row) => {
          const value = pick(row);
          return value === null ? [] : [{ date: row.monthDay, value }];
        }),
        scale,
      );
    return { observed: toPoints(observed), forecast: toPoints(joined) };
  };

  const max = lines((p) => p.tempMaxC);
  const min = lines((p) => p.tempMinC);

  const barWidth = Math.max(
    4,
    (box.width - box.padding.left - box.padding.right) /
      Math.max(1, series.points.length) -
      8,
  );

  return (
    <figure className="flex flex-col gap-2">
      <svg
        className="w-full"
        role="img"
        aria-label={summary}
        viewBox={`0 0 ${box.width} ${height}`}
      >
        {/* 강수 막대. 값이 없는 날은 아예 안 그린다. */}
        <g className="text-accent/30" fill="currentColor">
          {series.points.map((point) => {
            if (point.rainfallMm === null || rainMax <= 0) return null;
            const barHeight = (point.rainfallMm / rainMax) * (baseY - rainTop);
            return (
              <rect
                key={point.date}
                x={scale.x(point.monthDay) - barWidth / 2}
                y={baseY - barHeight}
                width={barWidth}
                height={Math.max(0, barHeight)}
                rx={2}
              />
            );
          })}
        </g>

        {/* 기온 선. 최고는 흙색, 최저는 인디고. */}
        <g fill="none" strokeLinecap="round" strokeWidth={2}>
          <g className="text-earth" stroke="currentColor">
            <polyline points={max.observed} />
            <polyline points={max.forecast} strokeDasharray="4 4" />
          </g>
          <g className="text-accent" stroke="currentColor">
            <polyline points={min.observed} />
            <polyline points={min.forecast} strokeDasharray="4 4" />
          </g>
        </g>

        {/* 날짜 라벨. */}
        <g className="text-fg-muted" fill="currentColor" fontSize={9}>
          {series.points.map((point, index) =>
            index % LABEL_EVERY === 0 ? (
              <text
                key={point.date}
                x={scale.x(point.monthDay)}
                y={height - 8}
                textAnchor="middle"
              >
                {point.monthDay}
              </text>
            ) : null,
          )}
        </g>

        {/* 기온 축 양 끝만. 눈금선을 다 그리면 막대와 겹쳐 지저분해진다. */}
        <g className="text-fg-muted" fill="currentColor" fontSize={9}>
          <text x={4} y={box.padding.top + 4}>
            {domain.hi}
          </text>
          <text x={4} y={baseY}>
            {domain.lo}
          </text>
        </g>
      </svg>

      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-fg-muted text-xs">
        <span className="text-earth">— 최고기온</span>
        <span className="text-accent">— 최저기온</span>
        <span>▯ 강수량{rainMax > 0 ? ` (최대 ${rainMax}mm)` : ""}</span>
        <span>┄ 점선은 예보</span>
      </figcaption>
    </figure>
  );
}
