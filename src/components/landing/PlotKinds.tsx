import { Reveal } from "@/components/shared/Reveal";
import { SectionHeading } from "@/components/shared/SectionHeading";
import type { PlotKind } from "@/features/monitoring/domain/observation";
import { PLOTS } from "@/features/monitoring/domain/plots";

/**
 * ---------------------------------------------
 * [Feature]: 세 가지 밭 (#plots) — 논 · 밭 · 과수
 *
 * [Description]
 * - 논·밭은 "심은 날부터 쌓은 열", 과수는 "한 해 중 어디쯤"으로 세는 방식이 다르다는
 *   것을 눈금 하나로 보여주는 절이다.
 * - **과수를 위한 분기를 만들지 않았다.** 눈금은 `stagesKo` 를 등간격으로 깔고
 *   `progress.ratio` 에 마커를 세우는 한 가지 규칙만 쓴다. 과수의 `progress.label`
 *   이 "오늘"이고 논이 "828 / 1150℃"인 것은 데이터가 알아서 말하는 차이라,
 *   화면이 kind 를 보고 다르게 그릴 이유가 없다.
 * - **가로 스크롤을 만들지 않기 위해** 눈금 라벨은 sm 이상에서만 그리고, 좁은 화면
 *   에서는 현재 단계 한 줄로 대신한다. 눈금 전체를 `role="img"` 로 묶고 aria-label
 *   한 문장에 단계 이름과 진행을 다 담았으므로, 라벨이 사라져도 읽히는 내용은 같다.
 *   (role="img" 의 자손 텍스트는 스크린리더가 읽지 않으므로 sr-only 를 따로 두지
 *   않는다 — 두면 중복으로 읽힐 뿐이다.)
 * - 상태가 없어 서버 컴포넌트다. 진입 연출만 Reveal(클라이언트)이 맡는다.
 *
 * [Usage]
 * ```tsx
 * <PlotKinds />
 * ```
 * ---------------------------------------------
 */

/** 카드 머리에 쓰는 한 글자~두 글자 이름. 원본 시안의 h3 과 같다. */
const KIND_LABEL: Record<PlotKind, string> = {
  paddy: "논",
  field: "밭",
  orchard: "과수",
};

/** 눈금 i번째가 놓일 위치(0~1). 단계가 하나뿐이면 나눗셈이 깨지므로 0 으로 둔다. */
function stageRatio(index: number, count: number): number {
  return count > 1 ? index / (count - 1) : 0;
}

/** 지금 지나온 마지막 단계. 데이터가 범위를 벗어나도 항상 유효한 인덱스를 준다. */
function currentStageIndex(stageCount: number, ratio: number): number {
  let current = 0;
  for (let i = 0; i < stageCount; i += 1) {
    if (stageRatio(i, stageCount) <= ratio) current = i;
  }
  return current;
}

interface StageTimelineProps {
  stagesKo: readonly string[];
  progress: { label: string; ratio: number };
  methodKo: string;
}

function StageTimeline({ stagesKo, progress, methodKo }: StageTimelineProps) {
  // 데이터가 0~1 을 벗어나도 막대가 칸 밖으로 나가지 않게 잘라 쓴다.
  const ratio = Math.min(1, Math.max(0, progress.ratio));
  const percent = ratio * 100;
  const currentIndex = currentStageIndex(stagesKo.length, ratio);
  const currentStage = stagesKo[currentIndex] ?? "";

  const label = `${methodKo}. ${stagesKo.join(" → ")} 중 ${currentStage} 지점, ${
    progress.label
  } (${Math.round(percent)}% 진행).`;

  return (
    <div aria-label={label} className="mt-6" role="img">
      {/* 눈금 라벨. 좁은 화면에서는 겹치므로 숨기고 아래 한 줄로 대신한다. */}
      <div aria-hidden="true" className="relative hidden h-4 sm:block">
        {stagesKo.map((stage, index) => {
          const isFirst = index === 0;
          const isLast = index === stagesKo.length - 1;
          const tone =
            index === currentIndex ? "text-accent" : "text-fg-subtle";
          const place = isFirst
            ? "left-0 text-left"
            : isLast
              ? "right-0 text-right"
              : "-translate-x-1/2 text-center";

          return (
            <span
              className={`absolute top-0 font-mono text-xs ${tone} ${place}`}
              key={stage}
              style={
                isFirst || isLast
                  ? undefined
                  : { left: `${stageRatio(index, stagesKo.length) * 100}%` }
              }
            >
              {stage}
            </span>
          );
        })}
      </div>

      <div className="relative mt-1 h-2 rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${percent}%` }}
        />

        {/* 가운데 단계의 눈금. 양 끝은 막대의 끝이 곧 눈금이라 그리지 않는다. */}
        {stagesKo.slice(1, -1).map((stage, index) => (
          <span
            aria-hidden="true"
            className="absolute top-0 h-2 w-px bg-border-strong"
            key={stage}
            style={{
              left: `${stageRatio(index + 1, stagesKo.length) * 100}%`,
            }}
          />
        ))}

        {/* 현재 위치 마커 */}
        <span
          aria-hidden="true"
          className="-top-1 -translate-x-1/2 absolute h-4 w-0.5 rounded-full bg-fg"
          style={{ left: `${percent}%` }}
        />
      </div>

      {/* 좁은 화면 전용 대체 라벨 */}
      <p
        aria-hidden="true"
        className="mt-2 font-mono text-accent text-xs sm:hidden"
      >
        {currentStage}
      </p>
    </div>
  );
}

export function PlotKinds() {
  return (
    <div className="w-full bg-surface-2" id="plots">
      <section className="mx-auto w-full max-w-6xl px-6 py-24 md:py-32">
        <SectionHeading
          description="논과 밭은 심은 날부터 열을 쌓아 세지만, 과수는 심은 지 몇 해 된 나무라 그 셈법이 통하지 않습니다. 그래서 화면도 계산도 따로 갑니다."
          eyebrow="세 가지 밭"
          title="재는 방식이 다릅니다"
        />

        <ul className="mt-14 grid gap-6 md:grid-cols-3">
          {PLOTS.map((plot, index) => (
            <Reveal as="li" delay={index * 80} key={plot.kind}>
              <article className="flex h-full flex-col rounded-xl border border-border bg-surface p-6">
                <h3 className="font-semibold text-2xl text-fg tracking-tight">
                  {KIND_LABEL[plot.kind]}
                </h3>
                <p className="mt-1 font-mono text-fg-subtle text-xs">
                  {plot.methodKo}
                </p>

                <StageTimeline
                  methodKo={plot.methodKo}
                  progress={plot.progress}
                  stagesKo={plot.stagesKo}
                />

                <p className="mt-5 font-mono text-2xl text-fg tabular-nums">
                  {plot.progress.label}
                </p>

                <p className="mt-3 text-pretty text-fg-muted text-sm leading-relaxed">
                  {plot.bodyKo}
                </p>

                <div className="mt-auto pt-6">
                  <p className="border-border border-t pt-4 text-fg-subtle text-xs leading-relaxed">
                    {plot.noteKo}
                  </p>
                </div>
              </article>
            </Reveal>
          ))}
        </ul>
      </section>
    </div>
  );
}
