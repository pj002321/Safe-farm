import { AlertTriangleIcon, CheckIcon } from "@/components/icons";
import {
  ObservationChart,
  type ObservationChartSeries,
} from "@/components/monitoring/chart/ObservationChart";
import { Card } from "@/components/shared/Card";
import { Reveal } from "@/components/shared/Reveal";
import { SectionHeading } from "@/components/shared/SectionHeading";
import {
  OBSERVATION_WINDOW,
  type ObservationSeries,
  SANGJU_SERIES,
  SATELLITE_NOTES,
} from "@/features/monitoring/domain/observation";

/**
 * ---------------------------------------------
 * [Feature]: 랜딩 "위성으로 본 상주" 절 (#sat)
 *
 * [Description]
 * - 같은 날 같은 하늘 아래 논·밭·과수원이 다르게 보인다는 것을 NDVI·NDMI 두 차트로
 *   보인다. 숫자는 한 자리도 여기서 만들지 않는다 — 전부 `monitoring/domain` 에서 온다.
 * - "솔직히 말하면"(관측 실패율·튀는 값) 목록은 **요청으로 걷어냈다.** 함께 쓰던
 *   `SATELLITE_NOTES.honestlyKo` 도 지웠다 — 화면에서 뺐는데 데이터만 남기면
 *   다음 사람이 "왜 안 쓰이지" 하고 되살린다.
 * - 필지 → 색 대응은 여기서 한 번만 정한다(논 accent · 밭 telemetry · 과수 earth).
 *   두 차트가 같은 대응을 써야 범례를 한 번만 읽고도 아래 차트를 읽을 수 있다.
 * - 서버 컴포넌트다. 상호작용이 없으므로 차트 전체가 HTML 로 실려 나간다.
 *
 * [Usage]
 * ```tsx
 * <SatelliteView />
 * ```
 * ---------------------------------------------
 */

/** 필지 종류별 강조색. 두 차트가 공유한다. */
const PLOT_TONE = {
  paddy: "accent",
  field: "telemetry",
  orchard: "earth",
} as const;

/** 도메인 시계열을 차트가 아는 모양(`{ date, value }`)으로 줄인다. */
function toChartSeries(
  series: readonly ObservationSeries[],
  key: "ndvi" | "ndmi",
): ObservationChartSeries[] {
  return series.map((one) => ({
    nameKo: `${one.nameKo} 해발 ${one.elevationM}m`,
    tone: PLOT_TONE[one.plot],
    points: one.points.map((point) => ({
      date: point.date,
      value: point[key],
    })),
  }));
}

const NDVI_SUMMARY =
  "상주 논·배추밭·단감 과수원의 NDVI 변화. 과수원이 늘 가장 높고 배추밭은 평탄하며, 관측은 열흘에 하루꼴로만 남았습니다.";
const NDMI_SUMMARY =
  "같은 세 지점의 NDMI 변화. 과수원만 4월 초에 음수로 시작해 4월 하순에 양수로 올라섭니다.";

interface NoteListProps {
  title: string;
  items: readonly string[];
  tone: "good" | "caution";
}

/** "이 값으로 할 수 있는 것" 목록의 껍데기. tone 은 caution 도 받는다. */
function NoteList({ title, items, tone }: NoteListProps) {
  const Icon = tone === "good" ? CheckIcon : AlertTriangleIcon;
  const iconClass = tone === "good" ? "text-good" : "text-caution";

  return (
    <Card padding="lg" tone="default">
      <h3 className="flex items-center gap-2 font-semibold text-base text-fg">
        <Icon aria-hidden="true" className={`size-5 shrink-0 ${iconClass}`} />
        {title}
      </h3>
      <ul className="mt-4 flex flex-col gap-3">
        {items.map((item) => (
          <li className="flex gap-3 text-fg-muted leading-relaxed" key={item}>
            <span
              aria-hidden="true"
              className={`mt-2 h-px w-3 shrink-0 bg-current ${iconClass}`}
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function SatelliteView() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-24 md:py-32" id="sat">
      <Reveal>
        <SectionHeading
          description="상주 안의 논·밭·과수원 세 곳을 4월부터 9월까지 따라갔습니다. 잎이 우거진 정도(NDVI)를 보면 나무가 있는 과수원이 늘 가장 높고, 배추밭은 평탄합니다. 다만 열흘에 하루꼴로만 값이 남았습니다."
          eyebrow="위성으로 본 상주"
          title="같은 날 같은 하늘 아래, 세 밭이 다르게 보입니다"
        />
      </Reveal>

      <div className="mt-12 flex flex-col gap-6">
        <Reveal delay={60}>
          <Card padding="lg" tone="default">
            <h3 className="font-semibold text-base text-fg">
              NDVI · 잎이 우거진 정도
            </h3>
            <p className="mt-1 font-mono text-fg-subtle text-xs tabular-nums">
              Sentinel-2 · {OBSERVATION_WINDOW.from} ~{" "}
              {OBSERVATION_WINDOW.to.slice(5)} · 유효 관측만
            </p>
            <div className="mt-5">
              <ObservationChart
                domain={{ lo: 0.2, hi: 0.85 }}
                height={180}
                series={toChartSeries(SANGJU_SERIES, "ndvi")}
                summary={NDVI_SUMMARY}
                tickStep={0.2}
              />
            </div>
          </Card>
        </Reveal>

        <Reveal delay={120}>
          <Card padding="lg" tone="default">
            <h3 className="font-semibold text-base text-fg">
              NDMI · 잎 속 수분
            </h3>
            <p className="mt-1 font-mono text-fg-subtle text-xs tabular-nums">
              같은 지점, 같은 날짜
            </p>
            <div className="mt-5">
              <ObservationChart
                domain={{ lo: -0.2, hi: 0.6 }}
                height={160}
                series={toChartSeries(SANGJU_SERIES, "ndmi")}
                summary={NDMI_SUMMARY}
                tickStep={0.2}
              />
            </div>
            <p className="mt-5 max-w-2xl text-fg-muted leading-relaxed">
              과수원만 4월 초에 <strong className="text-fg">음수</strong>로
              시작합니다. 감나무에 아직 잎이 나지 않아 맨 가지와 흙이 보인
              것입니다. 잎이 나면서 4월 하순에 양수로 올라섭니다. 위성은 이렇게{" "}
              <strong className="text-fg">잎이 언제 났는지</strong>도
              알려줍니다.
            </p>
          </Card>
        </Reveal>
      </div>

      {/* 2열이던 자리에 카드가 하나만 남았다. 섹션 폭을 그대로 쓴다. */}
      <div className="mt-6">
        <Reveal delay={60}>
          <NoteList
            items={SATELLITE_NOTES.canDoKo}
            title="이 값으로 할 수 있는 것"
            tone="good"
          />
        </Reveal>
      </div>
    </section>
  );
}
