import {
  axisTicks,
  type ChartBox,
  createScale,
  toPolylinePoints,
} from "@/features/monitoring/domain/chartScale";

/**
 * ---------------------------------------------
 * [Feature]: 위성 관측 꺾은선 차트 (인라인 SVG)
 *
 * [Description]
 * - 차트 라이브러리를 쓰지 않는다. 필요한 건 좌표 변환 하나뿐이고 그건
 *   `chartScale.ts` 의 순수 함수가 이미 한다. 여기는 그 결과를 SVG 로 옮기기만 한다.
 * - **SVG 안에 색을 적지 않는다.** 전부 `stroke/fill="currentColor"` 로 그리고
 *   감싸는 `<g>` 의 `text-accent` 같은 토큰 유틸리티가 색을 준다. 그래야 다크모드가
 *   따라오고, 원시 팔레트가 컴포넌트로 새지 않는다.
 * - **관측점마다 작은 원을 찍는다.** 이 데이터는 등간격이 아니라 구름을 피해 남은
 *   드문드문한 실측이다. 선만 그으면 매일 관측한 것처럼 보여 사실과 달라진다.
 * - 0선은 따로 그린다(NDMI 는 음수로 시작한다). 눈금선과 같은 굵기로 두면
 *   "음수였다"는 이 차트의 핵심이 눈금 사이에 묻힌다.
 * - 서버 컴포넌트다. 상태도 브라우저 API도 쓰지 않으므로 SSR 로 완성된다.
 *
 * [Usage]
 * ```tsx
 * <ObservationChart
 *   series={[{ nameKo: "논 해발 60m", tone: "accent", points: [{ date: "04-03", value: 0.257 }] }]}
 *   domain={{ lo: 0.2, hi: 0.85 }}
 *   tickStep={0.2}
 *   summary="상주 세 필지의 NDVI 는 4월 0.25 에서 9월 0.7 부근까지 올랐습니다."
 *   height={180}
 * />
 * ```
 * ---------------------------------------------
 */

/** 강조색은 accent(인디고)·telemetry(라임)·earth(흙) 셋뿐이다. */
type SeriesTone = "accent" | "telemetry" | "earth";

export interface ObservationChartSeries {
  nameKo: string;
  tone: SeriesTone;
  /** date 는 "MM-DD". 날짜 오름차순이라는 전제로 선을 잇는다. */
  points: readonly { date: string; value: number }[];
}

export interface ObservationChartProps {
  series: readonly ObservationChartSeries[];
  domain: { lo: number; hi: number };
  tickStep: number;
  /** 스크린리더용 한 문장 요약. 필수. 그림만 있고 설명이 없으면 값이 사라진다. */
  summary: string;
  height?: number;
}

const TONE_CLASS: Record<SeriesTone, string> = {
  accent: "text-accent",
  telemetry: "text-telemetry",
  earth: "text-earth",
};

/** viewBox 기준 폭. 화면 폭은 CSS(`w-full`)가 정하고 선 비율은 이 값이 지킨다. */
const WIDTH = 440;
const BOX_PADDING = { top: 12, right: 12, bottom: 26, left: 36 } as const;
const AXIS_FONT_SIZE = 9.5;

/**
 * x축에 찍을 월 라벨. 관측 구간에 실제로 걸치는 달만 "MM-01" 로 돌려준다.
 * 구간 밖 라벨은 스케일이 음수 좌표로 밀어내 축 왼쪽에 글자가 삐져나온다.
 */
function monthLabels(dates: readonly string[]): string[] {
  const months = dates
    .map((date) => Number(date.slice(0, 2)))
    .filter((month) => month >= 1 && month <= 12);
  if (months.length === 0) return [];
  const first = Math.min(...months);
  const last = Math.max(...months);
  const labels: string[] = [];
  for (let month = first; month <= last; month += 1) {
    labels.push(`${String(month).padStart(2, "0")}-01`);
  }
  return labels;
}

export function ObservationChart({
  series,
  domain,
  tickStep,
  summary,
  height = 180,
}: ObservationChartProps) {
  const allDates = series.flatMap((one) => one.points.map((p) => p.date));

  // 빈 계열이 들어와도 죽지 않아야 한다. 좌표를 계산할 날짜가 하나도 없으면
  // 텅 빈 축을 그리는 대신 사실을 그대로 적는다.
  if (allDates.length === 0) {
    return (
      <p className="rounded-md border border-border border-dashed px-4 py-10 text-center text-fg-subtle text-sm">
        표시할 관측값이 없습니다.
      </p>
    );
  }

  const box: ChartBox = { width: WIDTH, height, padding: BOX_PADDING };
  const ticks = axisTicks(domain.lo, domain.hi, tickStep);
  const decimals = (String(tickStep).split(".")[1] ?? "").length;

  // 눈금은 `domain` 안의 값을 `tickStep` 간격으로 반올림해 만든다 — 그 반올림이
  // `domain.hi` 를 살짝 넘기면(예: hi=0.282 인데 눈금은 반올림된 0.3) 맨 위 눈금이
  // 그린 영역 밖(y<0)으로 나가 SVG 위쪽에서 잘린다. 눈금을 반드시 담도록 도메인을
  // 넓혀서 스케일을 만든다 — 손으로 고른 "예쁜" domain(예: 0.2~0.85)에서는 원래
  // 안 걸리던 경우라 지금까지 안 보였다.
  const effectiveDomain = {
    lo: Math.min(domain.lo, ticks[0] ?? domain.lo),
    hi: Math.max(domain.hi, ticks.at(-1) ?? domain.hi),
  };
  const scale = createScale(allDates, effectiveDomain, box);

  const axisLeft = BOX_PADDING.left;
  const axisRight = WIDTH - BOX_PADDING.right;
  const hasZeroLine = effectiveDomain.lo < 0 && effectiveDomain.hi > 0;
  // 날짜가 한 종류뿐이면 모든 월 라벨이 같은 x 에 겹쳐 찍힌다.
  // 구간 밖으로 밀린 월 라벨은 축 왼쪽에 삐져나오거나 viewBox 에 잘린다.
  const labels = (
    new Set(allDates).size > 1 ? monthLabels(allDates) : []
  ).filter((label) => {
    const x = scale.x(label);
    return x >= axisLeft - 2 && x <= axisRight + 2;
  });

  return (
    <figure className="m-0">
      <svg
        aria-label={summary}
        className="h-auto w-full"
        role="img"
        viewBox={`0 0 ${WIDTH} ${height}`}
      >
        <title>{summary}</title>

        {/* y축 눈금선 + 눈금값 */}
        <g className="text-border" stroke="currentColor" strokeWidth={1}>
          {ticks.map((tick) => (
            <line
              key={tick}
              x1={axisLeft}
              x2={axisRight}
              y1={scale.y(tick).toFixed(1)}
              y2={scale.y(tick).toFixed(1)}
            />
          ))}
        </g>
        <g
          className="fill-fg-subtle font-mono tabular-nums"
          fontSize={AXIS_FONT_SIZE}
        >
          {ticks.map((tick) => (
            <text
              key={tick}
              textAnchor="end"
              x={axisLeft - 7}
              y={(scale.y(tick) + 3.5).toFixed(1)}
            >
              {tick.toFixed(decimals)}
            </text>
          ))}
          {labels.map((label) => (
            <text
              key={label}
              textAnchor="middle"
              x={scale.x(label).toFixed(1)}
              y={height - 8}
            >
              {Number(label.slice(0, 2))}월
            </text>
          ))}
        </g>

        {/* 0선: 눈금선과 구분되게 파선 + 진한 테두리색 */}
        {hasZeroLine && (
          <line
            className="text-border-strong"
            stroke="currentColor"
            strokeDasharray="3 3"
            strokeWidth={1}
            x1={axisLeft}
            x2={axisRight}
            y1={scale.y(0).toFixed(1)}
            y2={scale.y(0).toFixed(1)}
          />
        )}

        {series.map((one) => (
          <g className={TONE_CLASS[one.tone]} key={one.nameKo}>
            <polyline
              fill="none"
              points={toPolylinePoints(one.points, scale)}
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.6}
            />
            {one.points.map((point) => (
              <circle
                cx={scale.x(point.date).toFixed(1)}
                cy={scale.y(point.value).toFixed(1)}
                fill="currentColor"
                key={`${one.nameKo}-${point.date}`}
                r={1.9}
              />
            ))}
          </g>
        ))}
      </svg>

      {/* 범례는 SVG 밖 HTML 이다. SVG 안 텍스트는 확대·줄바꿈이 따라오지 않는다. */}
      <figcaption className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
        {series.map((one) => (
          <span
            className="flex items-center gap-2 text-fg-muted text-xs"
            key={one.nameKo}
          >
            <span
              aria-hidden="true"
              className={`h-2 w-2 shrink-0 rounded-sm bg-current ${TONE_CLASS[one.tone]}`}
            />
            {one.nameKo}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
