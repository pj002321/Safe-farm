import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { CropCards } from "@/components/plot/CropCards";
import { LocationSummary } from "@/components/plot/LocationSummary";
import { PlotInfoFields } from "@/components/plot/PlotInfoFields";
import { PlotMapFrame } from "@/components/plot/PlotMapFrame";
import { SowingFields } from "@/components/plot/SowingFields";
import { Button } from "@/components/shared/Button";
import { SectionHeading } from "@/components/shared/SectionHeading";

/**
 * ---------------------------------------------
 * [Feature]: 텃밭 등록 온보딩  →  /plots/new
 *
 * [Description]
 * - **퍼블(마크업) 단계다.** 지도 연결·좌표 변환·저장·임시 저장은 비어 있다.
 * - **한 번에 한 단계만 보인다.** 처음에는 네 단계를 모두 펼쳐 뒀는데, 등록 한 번
 *   하려고 화면을 계속 스크롤해야 했다. 정의서도 마법사이므로 한 단계씩이 맞다.
 * - 단계 전환을 **JS 없이** 한다. 숨긴 라디오 넷을 두고
 *   `group-has-[#아이디:checked]` 로 해당 패널과 레일 칸만 켠다. 이렇게 하면:
 *     · 이 화면의 JS 가 0바이트로 유지된다(로직을 비워 두라는 요구와 맞는다).
 *     · 라디오가 실제로 존재하므로 **키보드 화살표로 단계 이동**이 공짜로 따라온다.
 *     · 단계 레일과 이전/다음 버튼이 전부 `<label>` 이라 같은 상태 하나를 본다.
 * - ⚠️ `peer-checked/…` 를 먼저 썼다가 **레일이 안 켜져서** 바꿨다. `peer-*` 는
 *   형제 결합자(`~`)라 "형제의 자식"에는 닿지 않는데, 레일 칸은 `<ol><li>` 안에
 *   들어 있다. 패널은 폼의 직계 형제라 동작했고 레일만 조용히 죽어 있었다.
 *   `group-has-[…]` 는 조상에서 내려다보므로 중첩과 무관하게 닿는다.
 * - ⚠️ 단계 클래스를 **반복문으로 만들 수 없다.** Tailwind 는 클래스 문자열을
 *   정적으로 읽으므로 `group-has-[#wizard-${i}:checked]` 같은 조립은 생성되지
 *   않는다(조용히 사라진다). 그래서 네 벌을 **리터럴로** 적는다.
 * - 라디오의 `name="__step"` 은 화면 상태일 뿐 등록 값이 아니다. 저장 붙일 때
 *   무시하거나 걷어낼 것.
 *
 * [연결하는 사람에게]
 * - 지도는 `PlotMapFrame` 의 `PLOT_MAP_CONTAINER_ID` div 에 붙인다. 지도 중심이
 *   곧 밭 좌표다(중앙 핀 방식).
 * - 저장은 `<form>` 에 action 을 달면 된다. 입력 이름:
 *   latitude · longitude · name · areaM2 · areaUnit · crops(복수) ·
 *   sowingDate · sowingUnknown · sowingMethod
 * ---------------------------------------------
 */

export const metadata: Metadata = {
  title: "텃밭 등록",
  description: "지도에서 밭 위치를 지정하고 작물과 파종일을 등록합니다.",
};

/**
 * 단계 정의.
 *
 * `rail` 과 `panel` 이 **완성된 클래스 문자열**이어야 한다(위 주석 참고).
 * 조각을 이어 붙이면 Tailwind 가 못 읽고 그 단계만 조용히 안 보이게 된다.
 */
const STEPS = [
  {
    no: 1,
    id: "wizard-1",
    labelKo: "위치 지정",
    titleKo: "밭 위치 지정",
    descriptionKo:
      "지도를 움직여 밭을 한가운데 맞춰 주세요. 밭이 작아 한 지점만 받습니다.",
    rail: "group-has-[#wizard-1:checked]/wizard:border-accent group-has-[#wizard-1:checked]/wizard:bg-accent-subtle group-has-[#wizard-1:checked]/wizard:text-accent group-has-[#wizard-1:focus-visible]/wizard:outline group-has-[#wizard-1:focus-visible]/wizard:outline-2 group-has-[#wizard-1:focus-visible]/wizard:outline-ring group-has-[#wizard-1:focus-visible]/wizard:outline-offset-2",
    railNo:
      "group-has-[#wizard-1:checked]/wizard:bg-accent group-has-[#wizard-1:checked]/wizard:text-accent-on",
    panel: "hidden group-has-[#wizard-1:checked]/wizard:block",
  },
  {
    no: 2,
    id: "wizard-2",
    labelKo: "텃밭 정보",
    titleKo: "텃밭 정보",
    descriptionKo: "나중에 바꿀 수 있습니다. 건너뛰셔도 됩니다.",
    optional: true,
    rail: "group-has-[#wizard-2:checked]/wizard:border-accent group-has-[#wizard-2:checked]/wizard:bg-accent-subtle group-has-[#wizard-2:checked]/wizard:text-accent group-has-[#wizard-2:focus-visible]/wizard:outline group-has-[#wizard-2:focus-visible]/wizard:outline-2 group-has-[#wizard-2:focus-visible]/wizard:outline-ring group-has-[#wizard-2:focus-visible]/wizard:outline-offset-2",
    railNo:
      "group-has-[#wizard-2:checked]/wizard:bg-accent group-has-[#wizard-2:checked]/wizard:text-accent-on",
    panel: "hidden group-has-[#wizard-2:checked]/wizard:block",
  },
  {
    no: 3,
    id: "wizard-3",
    labelKo: "작물 선택",
    titleKo: "작물 선택",
    descriptionKo: "여러 개 고르실 수 있습니다.",
    rail: "group-has-[#wizard-3:checked]/wizard:border-accent group-has-[#wizard-3:checked]/wizard:bg-accent-subtle group-has-[#wizard-3:checked]/wizard:text-accent group-has-[#wizard-3:focus-visible]/wizard:outline group-has-[#wizard-3:focus-visible]/wizard:outline-2 group-has-[#wizard-3:focus-visible]/wizard:outline-ring group-has-[#wizard-3:focus-visible]/wizard:outline-offset-2",
    railNo:
      "group-has-[#wizard-3:checked]/wizard:bg-accent group-has-[#wizard-3:checked]/wizard:text-accent-on",
    panel: "hidden group-has-[#wizard-3:checked]/wizard:block",
  },
  {
    no: 4,
    id: "wizard-4",
    labelKo: "재배 정보",
    titleKo: "재배 정보",
    descriptionKo: "파종일을 아시면 그날부터 적산온도를 쌓습니다.",
    rail: "group-has-[#wizard-4:checked]/wizard:border-accent group-has-[#wizard-4:checked]/wizard:bg-accent-subtle group-has-[#wizard-4:checked]/wizard:text-accent group-has-[#wizard-4:focus-visible]/wizard:outline group-has-[#wizard-4:focus-visible]/wizard:outline-2 group-has-[#wizard-4:focus-visible]/wizard:outline-ring group-has-[#wizard-4:focus-visible]/wizard:outline-offset-2",
    railNo:
      "group-has-[#wizard-4:checked]/wizard:bg-accent group-has-[#wizard-4:checked]/wizard:text-accent-on",
    panel: "hidden group-has-[#wizard-4:checked]/wizard:block",
  },
] as const;

export default function PlotRegisterPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeading
          description="밭 위치와 작물을 알려 주시면, 그 자리의 기상 관측으로 할 일을 만들어 드립니다."
          eyebrow="plot / onboarding"
          title="텃밭 등록"
        />
        <Link
          className="text-fg-muted text-sm transition-colors hover:text-accent"
          href="/dashboard"
        >
          ← 대시보드
        </Link>
      </div>

      <form className="group/wizard mt-6">
        {/* 화면 상태를 들고 있는 라디오 넷. sr-only 지만 실제 포커스를 받으므로
            **키보드 화살표로 단계가 넘어간다.** group-has 로 읽으므로 위치는
            자유롭지만, 폼 안에 있어야 한다(group 이 폼이다). */}
        {STEPS.map((step) => (
          <input
            aria-label={`${step.no}단계 ${step.labelKo}`}
            className="sr-only"
            defaultChecked={step.no === 1}
            id={step.id}
            key={step.id}
            name="__step"
            type="radio"
          />
        ))}

        {/* ── 단계 레일 ─────────────────────────────
            각 칸이 `<label>` 이라 눌러서 바로 그 단계로 간다. */}
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-3">
          {STEPS.map((step, index) => (
            <li className="flex items-center gap-2" key={step.id}>
              <label
                className={`inline-flex cursor-pointer items-center gap-2 rounded-full border border-border px-3.5 py-1.5 font-medium text-fg-subtle text-sm transition-colors duration-200 ease-out-expo hover:border-accent hover:text-fg ${step.rail}`}
                htmlFor={step.id}
              >
                <span
                  aria-hidden="true"
                  className={`grid size-5 place-items-center rounded-full bg-surface-2 font-mono text-[0.7rem] text-fg-subtle ${step.railNo}`}
                >
                  {step.no}
                </span>
                {step.labelKo}
              </label>
              {index < STEPS.length - 1 && (
                <span
                  aria-hidden="true"
                  className="hidden h-px w-5 bg-border-strong sm:block"
                />
              )}
            </li>
          ))}
        </ol>

        {/* ── 단계별 패널 ───────────────────────────
            보이지 않는 패널의 입력도 DOM 에 남아 있으므로, 단계를 오가도
            먼저 적은 값이 사라지지 않고 제출에 함께 실린다. */}
        {STEPS.map((step) => (
          <StepPanel key={step.id} step={step}>
            {step.no === 1 && <LocationStep />}
            {step.no === 2 && <PlotInfoFields />}
            {step.no === 3 && (
              <fieldset>
                <legend className="sr-only">재배할 작물</legend>
                <CropCards defaultSelected={["cabbage"]} />
              </fieldset>
            )}
            {step.no === 4 && (
              <div className="max-w-md">
                <SowingFields />
              </div>
            )}
          </StepPanel>
        ))}
      </form>
    </main>
  );
}

/** 1단계 본문. 지도가 넓고 결과 칸이 옆에 붙는다. */
function LocationStep() {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <PlotMapFrame />
      <div className="self-start">
        <LocationSummary />
      </div>
    </div>
  );
}

function StepPanel({
  step,
  children,
}: {
  step: (typeof STEPS)[number];
  children: ReactNode;
}) {
  const previous = STEPS.find((candidate) => candidate.no === step.no - 1);
  const next = STEPS.find((candidate) => candidate.no === step.no + 1);

  return (
    <section
      aria-labelledby={`step-${step.no}-title`}
      className={`mt-7 ${step.panel}`}
    >
      <div className="mb-4">
        <h2
          className="font-semibold text-[1.15rem] text-fg tracking-tight"
          id={`step-${step.no}-title`}
        >
          {step.titleKo}
          {"optional" in step && step.optional && (
            <span className="ml-2 font-mono font-normal text-fg-subtle text-xs">
              (건너뛰기 가능)
            </span>
          )}
        </h2>
        <p className="mt-1 text-fg-muted text-sm">{step.descriptionKo}</p>
      </div>

      {children}

      {/* ── 단계 이동 ─────────────────────────────
          `<button>` 이 아니라 `<label>` 이다. 버튼으로 만들면 상태를 JS 로
          들고 있어야 하고, 폼 안의 button 은 실수로 제출을 일으킨다. */}
      <div className="mt-7 flex flex-col-reverse gap-3 border-border border-t pt-5 sm:flex-row sm:items-center">
        {previous && (
          <label
            className="cursor-pointer rounded-md border border-border-strong px-4 py-2 text-center font-medium text-fg text-sm transition-colors duration-200 ease-out-expo hover:border-accent hover:text-accent"
            htmlFor={previous.id}
          >
            ← {previous.labelKo}
          </label>
        )}

        <span className="hidden flex-1 sm:block" />

        {next ? (
          <label
            className="cursor-pointer rounded-md bg-accent px-5 py-2.5 text-center font-medium text-accent-on text-sm transition-colors duration-200 ease-out-expo hover:bg-accent-hover"
            htmlFor={next.id}
          >
            {next.labelKo} →
          </label>
        ) : (
          <Button size="lg" type="submit">
            텃밭 등록하기
          </Button>
        )}
      </div>

      <p className="mt-3 text-fg-subtle text-xs">
        입력하신 내용은 단계를 오가도 남아 있고, 자동으로 임시 저장됩니다.
      </p>
    </section>
  );
}
