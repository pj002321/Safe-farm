/**
 * ---------------------------------------------
 * [Feature]: 적산온도 진행 게이지
 *
 * [Description]
 * - "얼마나 자랐나"를 막대 하나로 보여준다. 눈금(`markRatio`)은 다음 단계가
 *   시작되는 지점이라, 지금 채워진 곳과 눈금 사이가 곧 "남은 만큼"이 된다.
 * - **막대를 진행 표시(progressbar)로 노출한다.** 색 채움만으로는 스크린리더가
 *   아무것도 읽지 못한다. `aria-valuenow` 와 `aria-valuetext` 로 숫자와 단위를
 *   함께 준다.
 * - 채움 애니메이션은 `transition` 으로 건다. 부모가 `revealed` 를 늦게 켜면
 *   0에서 목표까지 차오르는 것이 그대로 보인다 — 별도 애니메이션이 필요 없다.
 *
 * [Usage]
 * ```tsx
 * <GrowthGauge value={384.2} target={797} markRatio={0.63} revealed />
 * ```
 * ---------------------------------------------
 */

interface GrowthGaugeProps {
  /** 현재 누적 적산온도 */
  value: number;
  /** 목표 적산온도 */
  target: number;
  /** 0~1. 다음 단계가 시작되는 지점. */
  markRatio: number;
  markLabelKo: string;
  /** 왼쪽 아래 보조 문구 */
  footStartKo: string;
  footEndKo: string;
  /** 며칠째인지 */
  dayLabelKo: string;
  /** false 면 0% 에서 멈춰 있다가, true 가 되는 순간 차오른다. */
  revealed: boolean;
}

export function GrowthGauge({
  value,
  target,
  markRatio,
  markLabelKo,
  footStartKo,
  footEndKo,
  dayLabelKo,
  revealed,
}: GrowthGaugeProps) {
  const ratio = Math.min(1, Math.max(0, value / target));
  const percent = Math.round(ratio * 100);

  return (
    <div>
      <div className="flex items-baseline gap-2">
        <b className="font-mono font-semibold text-2xl text-fg tabular-nums tracking-tight">
          {value}
        </b>
        <span className="text-fg-muted text-sm">/ {target} GDD</span>
        <span className="ml-auto font-mono text-fg-muted text-xs">
          {dayLabelKo}
        </span>
      </div>

      <div
        aria-label="생육 진행"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percent}
        aria-valuetext={`${value} / ${target} GDD, ${percent}퍼센트`}
        className="relative mt-2 h-2 overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
      >
        <div
          className="h-full rounded-full bg-telemetry transition-[width] duration-[900ms] ease-out-expo"
          style={{ width: `${revealed ? percent : 0}%` }}
        />
      </div>

      {/* 눈금은 막대 바깥에 둔다 — overflow-hidden 안에 넣으면 잘린다. */}
      <div className="relative h-0">
        <span
          aria-hidden="true"
          className="-top-[14px] absolute h-3.5 w-0.5 rounded-full bg-earth"
          style={{ left: `${markRatio * 100}%` }}
        />
      </div>

      <div className="mt-2 flex justify-between font-mono text-[0.7rem] text-fg-subtle">
        <span>{footStartKo}</span>
        <span className="text-earth">{markLabelKo}</span>
        <span>{footEndKo}</span>
      </div>
    </div>
  );
}
