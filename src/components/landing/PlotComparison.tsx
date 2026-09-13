import { ArrowRightIcon } from "@/components/icons";
import { Badge } from "@/components/shared/Badge";
import { ButtonLink } from "@/components/shared/Button";
import { Reveal } from "@/components/shared/Reveal";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { PLOTS, type PlotProfile } from "@/features/monitoring/domain/plots";

/**
 * ---------------------------------------------
 * [Feature]: 내 밭 비교 섹션 (#my)
 *
 * [Description]
 * - 로그인 후에 보게 될 "내 밭 목록"을 미리 보여주는 구간이다. 같은 상주 안에서도
 *   밭마다 값이 갈린다는 것이 이 섹션의 유일한 주장이라, 세 필지를 나란히 놓고
 *   같은 축(기온·바람·일출입)으로만 비교한다.
 * - 데이터는 `PLOTS` 에서만 읽는다. 화면용 배열을 따로 두면 세 섹션이 서로 다른
 *   기온을 말하게 된다.
 * - **좁은 화면에서 표를 가로로 굴리지 않는다.** 6열 표는 360px 에서 읽히지 않고
 *   가로 스크롤은 페이지 전체를 흔든다. md 미만은 카드 목록, md 이상은 표로
 *   아예 다른 마크업을 그리되 값은 같은 헬퍼(`tempRange` 등)에서 만든다.
 * - 서버 컴포넌트다. 정렬·필터 같은 상호작용이 없으므로 클라이언트 번들에 올리지
 *   않는다. 등장 연출만 `Reveal` 에 맡긴다.
 *
 * [Usage]
 * ```tsx
 * <PlotComparison />
 * ```
 * ---------------------------------------------
 */

/** 상태 문구 → 배지 색. 없는 문구가 들어오면 중립으로 떨어뜨린다. */
const STATUS_TONE: Record<string, "good" | "caution" | "telemetry"> = {
  "이상 없음": "good",
  가을가뭄: "caution",
  "수확 한 달 전": "telemetry",
};

const MONO = "font-mono tabular-nums";

function tempRange(plot: PlotProfile): string {
  return `${plot.today.tempMinC.toFixed(1)} – ${plot.today.tempMaxC.toFixed(1)}`;
}

function sunKo(plot: PlotProfile): string {
  return `${plot.today.sunriseKo} · ${plot.today.sunsetKo}`;
}

function StatusBadge({ statusKo }: { statusKo: string }) {
  return (
    <Badge size="sm" tone={STATUS_TONE[statusKo] ?? "neutral"}>
      {statusKo}
    </Badge>
  );
}

const COLUMNS = [
  "밭",
  "작물",
  "오늘 기온",
  "새벽 바람",
  "해 뜸 · 짐",
  "오늘",
] as const;

export function PlotComparison() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-24 md:py-32" id="my">
      <SectionHeading
        description="밭마다 좌표가 다르니 바람도 기온도 다릅니다. 해발 158m 과수원은 74m 배추밭보다 하루 평균 0.6℃ 낮습니다. 밭을 누르면 그 밭의 오늘 화면으로 들어갑니다."
        eyebrow="로그인하면"
        title="같은 상주인데 밭마다 다릅니다"
      />

      <Reveal className="mt-10">
        {/* 좁은 화면 대체 뷰. 표를 가로로 굴리지 않기 위한 것이다. */}
        <ul className="flex flex-col gap-3 md:hidden">
          {PLOTS.map((plot) => (
            <li
              className="rounded-xl border border-border bg-surface p-4"
              key={plot.kind}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-fg text-sm">
                    {plot.nameKo}
                  </h3>
                  <p className="mt-0.5 text-fg-subtle text-xs">
                    {plot.cropKo} · 해발{" "}
                    <span className={MONO}>{plot.elevationM}m</span>
                  </p>
                </div>
                <StatusBadge statusKo={plot.today.statusKo} />
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div>
                  <dt className="text-fg-subtle">오늘 기온 ℃</dt>
                  <dd className={`mt-0.5 text-fg ${MONO}`}>
                    {tempRange(plot)}
                  </dd>
                </div>
                <div>
                  <dt className="text-fg-subtle">새벽 바람</dt>
                  <dd className={`mt-0.5 text-fg ${MONO}`}>
                    {plot.today.windKo}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-fg-subtle">해 뜸 · 짐</dt>
                  <dd className={`mt-0.5 text-fg ${MONO}`}>{sunKo(plot)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>

        <div className="hidden overflow-hidden rounded-xl border border-border bg-surface md:block">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">
              내 밭 세 곳의 오늘 기온 · 새벽 바람 · 일출입 시각과 상태 비교
            </caption>
            <thead>
              <tr className="border-border border-b bg-surface-2">
                {COLUMNS.map((column) => (
                  <th
                    className="px-4 py-3 font-mono font-normal text-fg-subtle text-xs uppercase tracking-[0.14em]"
                    key={column}
                    scope="col"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PLOTS.map((plot) => (
                <tr
                  className="border-border border-b last:border-b-0"
                  key={plot.kind}
                >
                  <th className="px-4 py-4 align-top font-normal" scope="row">
                    <span className="block font-semibold text-fg">
                      {plot.nameKo}
                    </span>
                    <span className="mt-0.5 block text-fg-subtle text-xs">
                      해발 <span className={MONO}>{plot.elevationM}m</span>
                    </span>
                  </th>
                  <td className="px-4 py-4 align-top text-fg-muted">
                    {plot.cropKo}
                  </td>
                  <td className={`px-4 py-4 align-top text-fg ${MONO}`}>
                    {tempRange(plot)}
                  </td>
                  <td className={`px-4 py-4 align-top text-fg-muted ${MONO}`}>
                    {plot.today.windKo}
                  </td>
                  <td className={`px-4 py-4 align-top text-fg-muted ${MONO}`}>
                    {sunKo(plot)}
                  </td>
                  <td className="px-4 py-4 align-top">
                    <StatusBadge statusKo={plot.today.statusKo} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Reveal>

      <Reveal delay={80}>
        <p className="mt-8 max-w-3xl text-pretty text-fg-muted text-sm leading-relaxed sm:text-base">
          해 뜨는 시각은 세 밭이 같습니다. 몇 킬로미터 차이로는 분 단위가 갈리지
          않습니다. 대신 <strong className="text-fg">기온이 갈립니다.</strong>{" "}
          배추밭과 과수원의 해발 차이 <span className={MONO}>84m</span>가 하루
          평균 <span className={MONO}>0.6℃</span>로 나타나는데, 이는 표준
          기온감률 <span className={MONO}>0.65℃/100m</span>와 맞아떨어집니다. 한
          철 백 일이면 적산온도가{" "}
          <strong className="text-fg">60도 가까이 벌어집니다.</strong> 같은
          작물이라도 산자락 밭이 더 늦게 여무는 이유입니다.
        </p>
      </Reveal>

      <Reveal className="mt-8" delay={120}>
        <ButtonLink
          href="/signup"
          iconEnd={<ArrowRightIcon />}
          variant="primary"
        >
          내 밭 등록하기
        </ButtonLink>
      </Reveal>
    </section>
  );
}
