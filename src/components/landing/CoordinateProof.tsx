import type { ReactNode } from "react";
import { ObservationChart } from "@/components/landing/chart/ObservationChart";
import { Card } from "@/components/shared/Card";
import { Reveal } from "@/components/shared/Reveal";
import { SectionHeading } from "@/components/shared/SectionHeading";
import {
  GOKSEONG_PADDY,
  latestPoint,
} from "@/features/monitoring/domain/observation";

/**
 * ---------------------------------------------
 * [Feature]: 랜딩 "좌표를 잘못 찍으면" 절 (#proof)
 *
 * [Description]
 * - 곡성 장선리 논은 상주 논과 정반대 모양을 그린다. 같은 위성·같은 방식이고
 *   다른 것은 좌표 하나뿐이다. 이 대조가 "지도에 핀을 찍게 하는 이유"를 대신 설명한다.
 * - 왼쪽 차트는 NDVI·NDMI 를 **한 차트에** 겹친다. 두 지수가 같은 6주 동안 함께
 *   내려앉는 모습이 곧 모내기의 증거라 나눠 그리면 대조가 사라진다.
 * - 큰 수치 "0.56 → 0.16" 은 적지 않고 관측의 처음·마지막 값에서 계산한다.
 *   데이터가 바뀌면 문장도 같이 바뀌어야 하고, 손으로 적은 숫자는 안 따라온다.
 * - 오른쪽 3블록은 원문 그대로다. 특히 "같은 숫자, 다른 뜻"(0.16 이 6월이면 정상,
 *   8월이면 고사)은 이 서비스의 한계를 스스로 밝히는 문장이라 다듬지 않는다.
 *
 * [Usage]
 * ```tsx
 * <CoordinateProof />
 * ```
 * ---------------------------------------------
 */

/** 곡성 논 좌표. 관측을 어디에 시켰는지가 이 절의 논지라 화면에 그대로 적는다. */
const GOKSEONG_COORDINATE = "35.298, 127.316 · 2026-05-01 ~ 06-15";

const CHART_SUMMARY =
  "곡성 장선리 논의 NDVI 는 5월 1일 0.56 에서 6월 15일 0.16 으로, NDMI 는 0.28 에서 음수로 함께 내려갑니다.";

const FINDINGS: readonly { headline: string; body: ReactNode }[] = [
  {
    headline: "상주 논은 안 떨어졌습니다",
    body: (
      <>
        같은 시기 상주 논 좌표는{" "}
        <strong className="font-mono text-fg tabular-nums">0.62 → 0.65</strong>
        로 오히려 올랐습니다. 모내기가 없었다는 뜻입니다.
      </>
    ),
  },
  {
    headline: "그래서 지도에 핀을 찍게 합니다",
    body: (
      <>
        텃밭 등록 화면에서 <strong className="text-fg">정확한 위치</strong>를
        받는 이유가 이것입니다. 몇십 미터만 어긋나도 옆 밭이나 도로를 읽습니다.
      </>
    ),
  },
  {
    headline: "같은 숫자, 다른 뜻",
    body: (
      <>
        <span className="font-mono tabular-nums">0.16</span>이 6월이면 정상이고
        8월이면 고사입니다. 적산온도와 생육단계를 함께 봐야 읽힙니다.
      </>
    ),
  },
];

export function CoordinateProof() {
  // 관측이 비어도 이 절이 통째로 깨지지 않게 한다 — latestPoint 는 빈 계열에 던진다.
  const firstPoint = GOKSEONG_PADDY.points[0];
  const drop = firstPoint
    ? `${firstPoint.ndvi.toFixed(2)} → ${latestPoint(GOKSEONG_PADDY).ndvi.toFixed(2)}`
    : "관측 없음";

  return (
    <div className="border-border border-y bg-surface-2">
      <section
        className="mx-auto w-full max-w-6xl px-6 py-24 md:py-32"
        id="proof"
      >
        <Reveal>
          <SectionHeading
            description="전남 곡성의 실제 논을 같은 방식으로 따라간 적이 있습니다. 상주와 정반대 모양이 나왔습니다. 차이는 좌표 하나였습니다."
            eyebrow="좌표를 잘못 찍으면"
            title="위성은 시키는 곳만 봅니다"
          />
        </Reveal>

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <Reveal delay={60}>
            <Card padding="lg" tone="default">
              <h3 className="font-semibold text-base text-fg">
                곡성 장선리 논 · 실제 논
              </h3>
              <p className="mt-1 font-mono text-fg-subtle text-xs tabular-nums">
                {GOKSEONG_COORDINATE}
              </p>
              <div className="mt-5">
                <ObservationChart
                  domain={{ lo: -0.2, hi: 0.6 }}
                  height={170}
                  series={[
                    {
                      nameKo: "NDVI",
                      tone: "telemetry",
                      points: GOKSEONG_PADDY.points.map((point) => ({
                        date: point.date,
                        value: point.ndvi,
                      })),
                    },
                    {
                      nameKo: "NDMI",
                      tone: "accent",
                      points: GOKSEONG_PADDY.points.map((point) => ({
                        date: point.date,
                        value: point.ndmi,
                      })),
                    },
                  ]}
                  summary={CHART_SUMMARY}
                  tickStep={0.2}
                />
              </div>

              <p className="mt-6 font-mono font-semibold text-3xl text-fg tabular-nums">
                {drop}
              </p>
              <p className="mt-2 max-w-prose text-fg-muted leading-relaxed">
                여섯 주 만에 뚝 떨어졌습니다. 고사가 아니라{" "}
                <strong className="text-fg">모내기</strong>입니다. 논을 갈아엎고
                물을 대면 위에서 보이는 초록이 사라집니다.
              </p>
            </Card>
          </Reveal>

          <ul className="flex flex-col gap-6">
            {FINDINGS.map((finding, index) => (
              <Reveal as="li" delay={120 + index * 60} key={finding.headline}>
                <Card padding="lg" tone="default">
                  <h3 className="font-semibold text-base text-fg">
                    {finding.headline}
                  </h3>
                  <p className="mt-2 text-fg-muted leading-relaxed">
                    {finding.body}
                  </p>
                </Card>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
