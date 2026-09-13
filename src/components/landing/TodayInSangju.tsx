import { SirenIcon } from "@/components/icons";
import { Badge } from "@/components/shared/Badge";
import { Reveal } from "@/components/shared/Reveal";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { SANGJU_TODAY } from "@/features/monitoring/domain/plots";

/**
 * ---------------------------------------------
 * [Feature]: 오늘 상주 섹션 (#today)
 *
 * [Description]
 * - 지금 이 순간의 실측값 한 판. 수치는 전부 `SANGJU_TODAY` 에서 읽는다 —
 *   화면에 숫자를 직접 적으면 "꾸며낸 숫자가 하나도 없다"는 문장이 거짓이 된다.
 * - 경보 박스는 색면을 깔지 않고 왼쪽 2px 선 + 옅은 배경으로만 구분한다. 색만으로
 *   위험을 알리지 않도록 배지 문구("가을가뭄")와 아이콘을 함께 둔다.
 * - 서버 컴포넌트다. 상호작용이 없으므로 등장 연출만 `Reveal` 에 맡긴다.
 *
 * [Usage]
 * ```tsx
 * <TodayInSangju />
 * ```
 * ---------------------------------------------
 */

const MONO = "font-mono tabular-nums";

/** 상단 수치 5개. 라벨에 단위를 붙여 값 쪽을 숫자만으로 정렬한다. */
const METRICS: readonly { value: string; labelKo: string }[] = [
  {
    value: `${SANGJU_TODAY.tempMinC.toFixed(1)} – ${SANGJU_TODAY.tempMaxC.toFixed(1)}`,
    labelKo: "오늘 기온 ℃",
  },
  { value: SANGJU_TODAY.rain7dMm.toFixed(1), labelKo: "이레 강수 mm" },
  { value: SANGJU_TODAY.gddToday.toFixed(1), labelKo: "하루 적산 GDD" },
  { value: SANGJU_TODAY.daysToHeading, labelKo: "결구까지" },
  { value: SANGJU_TODAY.harvestKo, labelKo: "배추 수확기" },
];

export function TodayInSangju() {
  return (
    <section
      className="mx-auto w-full max-w-6xl px-6 py-24 md:py-32"
      id="today"
    >
      <SectionHeading
        description="꾸며낸 숫자가 하나도 없습니다. 기상청 관측소에서 받은 실측과 농진청 기준으로 계산한 결과입니다."
        eyebrow="오늘 상주"
        title="지금 이 순간의 값입니다"
      />

      <Reveal className="mt-10">
        <div className="rounded-xl border border-border bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 border-border border-b px-6 py-4">
            <p className="font-medium text-fg text-sm">
              {SANGJU_TODAY.stationKo}
            </p>
            <p className={`text-fg-subtle text-xs ${MONO}`}>
              {SANGJU_TODAY.dateKo}
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 lg:grid-cols-5">
            {METRICS.map((metric) => (
              <div className="bg-surface px-6 py-5" key={metric.labelKo}>
                <dd className={`text-fg text-xl sm:text-2xl ${MONO}`}>
                  {metric.value}
                </dd>
                <dt className="mt-1 text-fg-muted text-xs">{metric.labelKo}</dt>
              </div>
            ))}
          </dl>

          <div className="border-caution border-l-2 bg-caution/5 px-6 py-5">
            <Badge
              icon={<SirenIcon className="size-3.5" />}
              size="sm"
              tone="caution"
            >
              {SANGJU_TODAY.alertKo}
            </Badge>
            <p className="mt-3 text-pretty text-fg-muted text-sm leading-relaxed">
              {SANGJU_TODAY.alertBodyKo}
            </p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
