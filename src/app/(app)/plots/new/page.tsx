import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { CropCards } from "@/components/plot/CropCards";
import { PlotInfoFields } from "@/components/plot/PlotInfoFields";
import { PlotLocationStep } from "@/components/plot/PlotLocationStep";
import { PlotRegisterForm } from "@/components/plot/PlotRegisterForm";
import { PlotWizardDock } from "@/components/plot/PlotWizardDock";
import { WizardNav } from "@/components/plot/WizardNav";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { listCropOptions } from "@/features/crops/cropStore";
import { kstDateString } from "@/shared/utils/kstDate";
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
 * - 단계 전환을 **JS 없이** 한다. 숨긴 라디오 셋을 두고
 *   `group-has-[#아이디:checked]` 로 해당 패널과 레일 칸만 켠다. 이렇게 하면:
 *     · 단계 전환·폼 제출 자체는 JS 가 0바이트다(로직을 비워 두라는 요구와
 *       맞는다). 3단계 안의 작물 검색만 예외다 — CSS 로는 타이핑한 문자열을
 *       형제 카드의 텍스트와 비교할 수 없어 `CropCards` 만 `"use client"` 다
 *       (그 파일 docstring 참고). 선택·제출은 거기서도 여전히 체크박스가 한다.
 *     · 라디오가 실제로 존재하므로 **키보드 화살표로 단계 이동**이 공짜로 따라온다.
 *     · 단계 레일과 이전/다음 버튼이 전부 `<label>` 이라 같은 상태 하나를 본다.
 * - :경고: `peer-checked/…` 를 먼저 썼다가 **레일이 안 켜져서** 바꿨다. `peer-*` 는
 *   형제 결합자(`~`)라 "형제의 자식"에는 닿지 않는데, 레일 칸은 `<ol><li>` 안에
 *   들어 있다. 패널은 폼의 직계 형제라 동작했고 레일만 조용히 죽어 있었다.
 *   `group-has-[…]` 는 조상에서 내려다보므로 중첩과 무관하게 닿는다.
 * - :경고: 단계 클래스를 **반복문으로 만들 수 없다.** Tailwind 는 클래스 문자열을
 *   정적으로 읽으므로 `group-has-[#wizard-${i}:checked]` 같은 조립은 생성되지
 *   않는다(조용히 사라진다). 그래서 세 벌을 **리터럴로** 적는다.
 * - 라디오의 `name="__step"` 은 화면 상태일 뿐 등록 값이 아니다. 저장 붙일 때
 *   무시하거나 걷어낼 것.
 *
 * [연결하는 사람에게]
 * - 지도는 `PlotMapFrame` 의 `PLOT_MAP_CONTAINER_ID` div 에 붙인다. 지도 중심이
 *   곧 밭 좌표다(중앙 핀 방식).
 * - 입력 이름: latitude · longitude · addressKo · regionCode · regionKo ·
 *   name · areaM2 · areaUnit · cropIds(복수) · sowingDate.<cropId> ·
 *   sowingUnknown.<cropId> · sowingMethod.<cropId>. 파종 필드는 작물마다
 *   따로다(`CropCards` 참고) — `registerPlot` 이 `parsePlotRegistration` 과
 *   `parseCultivationSelections` 둘로 나눠 읽는다.
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
/** 독의 제출 버튼이 폼 밖에서 `form` 속성으로 이 폼을 가리킨다. 지우면 제출이 죽는다. */
const FORM_ID = "plot-form";

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
    descriptionKo: "면적은 물 주는 양을 가늠하는 데 씁니다.",
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
    descriptionKo:
      "여러 개 고르실 수 있습니다. 작물마다 파종일도 함께 입력해 주세요.",
    rail: "group-has-[#wizard-3:checked]/wizard:border-accent group-has-[#wizard-3:checked]/wizard:bg-accent-subtle group-has-[#wizard-3:checked]/wizard:text-accent group-has-[#wizard-3:focus-visible]/wizard:outline group-has-[#wizard-3:focus-visible]/wizard:outline-2 group-has-[#wizard-3:focus-visible]/wizard:outline-ring group-has-[#wizard-3:focus-visible]/wizard:outline-offset-2",
    railNo:
      "group-has-[#wizard-3:checked]/wizard:bg-accent group-has-[#wizard-3:checked]/wizard:text-accent-on",
    panel: "hidden group-has-[#wizard-3:checked]/wizard:block",
  },
] as const;

export default async function PlotRegisterPage() {
  // 작물 목록은 DB(작물 마스터)에서 온다. 예전에는 CropCards 에 세 개가 박혀
  // 있었는데, 그 id 가 마스터와 달라 저장할 작물을 못 찾았다.
  const crops = await listCropOptions();
  // 파종일 달력의 상한선. 한국 기준 오늘을 서버가 한 번 정해 내려보낸다.
  const today = kstDateString();

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

      {/*
        ⚠️ `group/wizard` 가 **폼이 아니라 이 div** 에 있다. 하단 독이 폼 **밖**에
           있어야 하는데(PlotWizardDock 주석 참고: fixed + backdrop-filter 함정),
           `group-has` 는 조상에서 내려다보는 방식이라 폼과 독을 **함께** 감싸는
           것이 그룹을 들어야 양쪽이 같은 라디오를 본다.
        ⚠️ 폼의 `id` 는 장식이 아니다. 독의 제출 버튼이 폼 밖에 있어서 `form`
           속성으로 잇는데, 이게 없으면 버튼의 form 소유자가 null 이라
           **아무 일도 없이 조용히 제출이 안 된다.**
      */}
      <div className="group/wizard mt-6">
        <PlotRegisterForm action={registerPlot} id={FORM_ID}>
          {/* 화면 상태를 들고 있는 라디오 셋. sr-only 지만 실제 포커스를 받으므로
              **키보드 화살표로 단계가 넘어간다.** `group-has` 로 읽으므로 위치는
              자유롭지만 **그룹 div 안**에 있어야 한다(그룹은 이 폼의 부모다).
              fieldset 으로 묶는 이유: 라디오 셋이 이름 없이 흩어져 있으면
              스크린리더가 "3개 중 2번째"만 읽고 무엇의 4개인지 말하지 않는다. */}
          <fieldset>
            <legend className="sr-only">등록 단계</legend>
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
          </fieldset>

          {/* ── 단계 레일 ─────────────────────────────
            각 칸이 `<label>` 이라 눌러서 바로 그 단계로 간다. */}
          {/*
          좁은 화면에서는 숨긴다. 실측하면 알약 하나가 109.83px 라 375·390 양쪽에서
          **2줄로 깨지고**(80px 의 군더더기), 터치 타깃이 34px 로 같은 화면 독 탭
          (53.84px)의 63% 였다. 그 폭에서 단계 이동은 독이 맡고, 지금 어느 단계인지는
          독의 "2/4 텃밭 정보" 와 패널 제목이 말한다. 건너뛰기는 넓은 화면 전용이다.
        */}
          <ol className="hidden flex-wrap items-center gap-x-2 gap-y-3 lg:flex">
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

              높이 하한이 **넓은 화면에만** 남아 있다. 단계마다 내용 높이가 달라서
              아래 이동 버튼이 튀는 문제 때문인데, 좁은 화면에서는 그 버튼이 이제
              `fixed` 독으로 빠져나가 **흐름에 없으므로** 하한을 걸 이유가 없다.
              예전에는 세 벌(38/40/32rem)을 손으로 재서 맞췄고, 그 탓에 1단계에서
              빈 칸 127px 를 스크롤해야 했다(375x812 실측). 그게 사라졌다.

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
                    <CropCards crops={crops} maxSowingDate={today} />
                  </fieldset>
                )}
              </StepPanel>
            ))}
          </div>
          <WizardNav />
        </PlotRegisterForm>

        {/* 폼 **밖**이다. 이유는 PlotWizardDock 주석 참고(fixed 기준 블록 + 제출 값). */}
        <PlotWizardDock formId={FORM_ID} />
      </div>
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
        </h2>
        <p className="mt-1 text-fg-muted text-sm">{step.descriptionKo}</p>
      </div>

      {children}
    </section>
  );
}
