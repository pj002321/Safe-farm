import type { ReactNode } from "react";
import { FieldIcon, HarvestIcon, SproutIcon } from "@/components/icons";
import { Reveal } from "@/components/shared/Reveal";
import { SectionHeading } from "@/components/shared/SectionHeading";
import type { PlotKind } from "@/features/monitoring/domain/observation";
import { PLOTS } from "@/features/monitoring/domain/plots";
import { FieldGutter } from "./FieldGutter";

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

/**
 * 밭 종류의 얼굴.
 *
 * 셋이 똑같은 흰 카드에 글자만 다르게 있어서, 작물이 화면에 전혀 드러나지
 * 않았다. 아이콘과 색을 붙여 한눈에 구분되게 한다. 색은 **의미에서** 골랐다:
 *   논   물을 대는 곳     → info(빙하색)
 *   밭   드러난 흙        → earth(점토색)
 *   과수 잎이 덮은 나무   → telemetry(식생지수 라임)
 * 임의로 예쁜 색을 고른 것이 아니라 globals.css 의 색 언어를 그대로 쓴 것이다.
 *
 * ⚠️ 클래스를 조립하지 말 것. Tailwind 는 클래스 문자열을 정적으로 읽으므로
 *    `text-${tone}` 같은 조립은 생성되지 않는다(조용히 사라진다).
 */
const KIND_STYLE: Record<
  PlotKind,
  { labelKo: string; icon: ReactNode; chip: string; mark: string; text: string }
> = {
  paddy: {
    labelKo: "논",
    icon: <SproutIcon />,
    chip: "bg-info/10 text-info",
    mark: "bg-info",
    text: "text-info",
  },
  field: {
    labelKo: "밭",
    icon: <FieldIcon />,
    chip: "bg-earth-subtle text-earth",
    mark: "bg-earth",
    text: "text-earth",
  },
  orchard: {
    labelKo: "과수",
    icon: <HarvestIcon />,
    chip: "bg-telemetry-subtle text-telemetry",
    mark: "bg-telemetry",
    text: "text-telemetry",
  },
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
  /** 밭 종류 색. 완성된 클래스 문자열이어야 한다(위 주석 참고). */
  markClass: string;
  textClass: string;
}

function StageTimeline({
  stagesKo,
  progress,
  methodKo,
  markClass,
  textClass,
}: StageTimelineProps) {
  // 데이터가 0~1 을 벗어나도 막대가 칸 밖으로 나가지 않게 잘라 쓴다.
  const ratio = Math.min(1, Math.max(0, progress.ratio));
  const percent = ratio * 100;
  const currentIndex = currentStageIndex(stagesKo.length, ratio);
  const currentStage = stagesKo[currentIndex] ?? "";

  const label = `${methodKo}. ${stagesKo.join(" → ")} 중 ${currentStage} 지점, ${
    progress.label
  } (${Math.round(percent)}% 진행).`;

  return (
    <div aria-label={label} className="mt-3" role="img">
      {/* 눈금 라벨. 좁은 화면에서는 겹치므로 숨기고 아래 한 줄로 대신한다. */}
      <div aria-hidden="true" className="relative hidden h-4 sm:block">
        {stagesKo.map((stage, index) => {
          const isFirst = index === 0;
          const isLast = index === stagesKo.length - 1;
          const tone = index === currentIndex ? textClass : "text-fg-subtle";
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
        {/* 채움도 밭 종류 색. 여기만 accent(인디고)로 두면 카드가 색을 갖고도
            정작 가장 넓은 면이 다시 한 톤으로 돌아간다. */}
        <div
          className={`h-full rounded-full ${markClass}`}
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
          className={`-top-1 -translate-x-1/2 absolute h-4 w-0.5 rounded-full ${markClass}`}
          style={{ left: `${percent}%` }}
        />
      </div>

      {/* 좁은 화면 전용 대체 라벨 */}
      <p
        aria-hidden="true"
        className={`mt-2 font-mono text-xs sm:hidden ${textClass}`}
      >
        {currentStage}
      </p>
    </div>
  );
}

export function PlotKinds() {
  return (
    <div
      // 잎(라임) → 흙(점토) 방향의 옅은 물. 이 절이 "작물" 절인데 배경이 다른
      // 절과 똑같은 무채색이라, 화면 전체가 회백색 한 톤으로 읽혔다.
      // subtle 토큰은 테마별로 값이 갈려 있어 다크에서도 짙은 녹/갈로 따라온다.
      className="relative w-full overflow-hidden bg-gradient-to-b from-telemetry-subtle via-surface-2 to-earth-subtle"
      id="plots"
    >
      {/* 본문 양옆 빈 띠에 까는 장식. 폭이 여백을 그대로 따라가므로 좁은 화면에서는
          저절로 0 이 된다. 왼쪽은 잎(라임), 오른쪽은 흙(점토)으로 이 절의 색 언어를
          가장자리까지 잇는다. */}
      <FieldGutter className="text-telemetry" side="left" />
      <FieldGutter className="text-earth" side="right" />

      <section className="relative mx-auto w-full max-w-6xl px-6 py-24 md:py-32">
        <SectionHeading
          description="논과 밭은 심은 날부터 열을 쌓아 세지만, 과수는 심은 지 몇 해 된 나무라 그 셈법이 통하지 않습니다. 그래서 화면도 계산도 따로 갑니다."
          eyebrow="세 가지 밭"
          title="재는 방식이 다릅니다"
        />

        <ul className="mt-14 grid gap-6 md:grid-cols-3">
          {PLOTS.map((plot, index) => {
            const style = KIND_STYLE[plot.kind];
            return (
              <Reveal as="li" delay={index * 80} key={plot.kind}>
                <article className="flex h-full flex-col rounded-xl border border-border bg-surface p-6">
                  <div className="flex items-center gap-3">
                    {/* 아이콘이 카드의 얼굴이다. 색은 종류마다 다르고, 글자와
                      함께 두므로 색만으로 구분하게 두지 않는다. */}
                    <span
                      aria-hidden="true"
                      className={`grid size-11 shrink-0 place-items-center rounded-xl text-xl ${style.chip}`}
                    >
                      {style.icon}
                    </span>
                    <div className="min-w-0">
                      {/* 밭 이름이 제목이다. 예전에는 "논"·"밭"·"과수" 만 찍었는데,
                        데이터에는 "낙동강변 논"·"배추밭"·"단감 과수원" 과 작물명이
                        이미 들어 있었다. 종류는 배지로 남겨 이 절의 논지(재는 방식이
                        다르다)를 지키면서, 작물이 화면에 드러나게 한다. */}
                      <div className="flex items-center gap-2">
                        <h3 className="truncate font-semibold text-fg text-xl tracking-tight">
                          {plot.nameKo}
                        </h3>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 font-medium text-[0.7rem] ${style.chip}`}
                        >
                          {style.labelKo}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-fg-muted text-sm">
                        {plot.cropKo}
                      </p>
                    </div>
                  </div>

                  <p className="mt-5 font-mono text-fg-subtle text-xs">
                    {plot.methodKo}
                  </p>

                  <StageTimeline
                    markClass={style.mark}
                    methodKo={plot.methodKo}
                    progress={plot.progress}
                    stagesKo={plot.stagesKo}
                    textClass={style.text}
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
            );
          })}
        </ul>
      </section>
    </div>
  );
}
