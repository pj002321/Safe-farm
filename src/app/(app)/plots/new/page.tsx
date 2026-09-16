import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { CropCards } from "@/components/plot/CropCards";
import { PlotInfoFields } from "@/components/plot/PlotInfoFields";
import { PlotLocationStep } from "@/components/plot/PlotLocationStep";
import { SowingFields } from "@/components/plot/SowingFields";
import { WizardNav } from "@/components/plot/WizardNav";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { listCropOptions } from "@/features/crops/cropStore";
import { registerPlot } from "./actions";

/**
 * ---------------------------------------------
 * [Feature]: 텃밭 등록 온보딩  →  /plots/new
 *
 * [Description]
 * - 지도 연결·좌표 변환은 `PlotLocationStep` 이, 저장은 `./actions.ts` 의
 *   `registerPlot` 이 한다. 임시 저장은 아직 없다.
 * - **한 번에 한 단계만 보인다.** 처음에는 네 단계를 모두 펼쳐 뒀는데, 등록 한 번
 *   하려고 화면을 계속 스크롤해야 했다. 정의서도 마법사이므로 한 단계씩이 맞다.
 * - 단계 전환을 **JS 없이** 한다. 숨긴 라디오 넷을 두고
 *   `group-has-[#아이디:checked]` 로 해당 패널과 레일 칸만 켠다. 이렇게 하면:
 *     · 이 화면의 JS 가 0바이트로 유지된다(로직을 비워 두라는 요구와 맞는다).
 *     · 라디오가 실제로 존재하므로 **키보드 화살표로 단계 이동**이 공짜로 따라온다.
 *     · 단계 레일과 이전/다음 버튼이 전부 `<label>` 이라 같은 상태 하나를 본다.
 * - :경고: `peer-checked/…` 를 먼저 썼다가 **레일이 안 켜져서** 바꿨다. `peer-*` 는
 *   형제 결합자(`~`)라 "형제의 자식"에는 닿지 않는데, 레일 칸은 `<ol><li>` 안에
 *   들어 있다. 패널은 폼의 직계 형제라 동작했고 레일만 조용히 죽어 있었다.
 *   `group-has-[…]` 는 조상에서 내려다보므로 중첩과 무관하게 닿는다.
 * - :경고: 단계 클래스를 **반복문으로 만들 수 없다.** Tailwind 는 클래스 문자열을
 *   정적으로 읽으므로 `group-has-[#wizard-${i}:checked]` 같은 조립은 생성되지
 *   않는다(조용히 사라진다). 그래서 네 벌을 **리터럴로** 적는다.
 * - 라디오의 `name="__step"` 은 화면 상태일 뿐 등록 값이 아니다. 저장 붙일 때
 *   무시하거나 걷어낼 것.
 *
 * [연결하는 사람에게]
 * - 지도는 `PlotMapFrame` 의 `PLOT_MAP_CONTAINER_ID` div 에 붙인다. 지도 중심이
 *   곧 밭 좌표다(중앙 핀 방식).
 * - 입력 이름: latitude · longitude · addressKo · regionCode · regionKo ·
 *   name · areaM2 · areaUnit · crops(복수) · sowingDate · sowingUnknown ·
 *   sowingMethod. `registerPlot` 이 이 이름 그대로 읽는다.
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

export default async function PlotRegisterPage() {
  // 작물 목록은 DB(작물 마스터)에서 온다. 예전에는 CropCards 에 세 개가 박혀
  // 있었는데, 그 id 가 마스터와 달라 저장할 작물을 못 찾았다.
  const crops = await listCropOptions();

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

      <form action={registerPlot} className="group/wizard mt-6">
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
            먼저 적은 값이 사라지지 않고 제출에 함께 실린다.

            :경고: **높이를 고정한다.** 단계마다 내용 높이가 달라서 아래 이동 버튼이
            매번 다른 자리로 튀었다. 다음을 연달아 누르는 화면에서 버튼이 움직이면
            누르려던 자리에 다른 것이 와 있게 된다. 짧은 단계에서는 아래가 비지만,
            버튼이 제자리에 있는 편이 낫다.

            값은 실측한 **가장 높은 단계**에 맞췄다(눈대중하지 말고 다시 잴 것).
            단이 셋인 이유는 높이를 바꾸는 지점이 둘이기 때문이다:
              ~sm   지도 19rem, 세로 배치 → 3단계 605px  → 38rem
              sm~lg 지도 22rem, 아직 세로 → 1단계 630px  → 40rem
              lg~   지도 22rem, 가로 배치 → 1단계 509px  → 32rem
            처음에 `lg` 한 곳만 나눴다가 **태블릿 폭에서 22px 어긋났다** —
            지도가 sm 에서 커지는데 그리드는 lg 에서야 갈라지기 때문이다. */}
        <div className="mt-7 min-h-[38rem] sm:min-h-[40rem] lg:min-h-[32rem]">
          {STEPS.map((step) => (
            <StepPanel key={step.id} step={step}>
              {step.no === 1 && <PlotLocationStep />}
              {step.no === 2 && <PlotInfoFields />}
              {step.no === 3 && (
                <fieldset>
                  <legend className="sr-only">재배할 작물</legend>
                  <CropCards crops={crops} />
                </fieldset>
              )}
              {step.no === 4 && (
                <div className="max-w-md">
                  <SowingFields />
                </div>
              )}
            </StepPanel>
          ))}
        </div>

        <WizardNav />
      </form>
    </main>
  );
}

function StepPanel({
  step,
  children,
}: {
  step: (typeof STEPS)[number];
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`step-${step.no}-title`} className={step.panel}>
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
    </section>
  );
}
