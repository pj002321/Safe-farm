import type { Metadata } from "next";
import Link from "next/link";
import { FieldIcon } from "@/components/icons";
import { CropCards } from "@/components/plot/CropCards";
import { LocationSummary } from "@/components/plot/LocationSummary";
import { PlotMapFrame } from "@/components/plot/PlotMapFrame";
import { SowingFields } from "@/components/plot/SowingFields";
import { Button } from "@/components/shared/Button";
import { Field } from "@/components/shared/Field";
import { SectionHeading } from "@/components/shared/SectionHeading";

/**
 * ---------------------------------------------
 * [Feature]: 텃밭 등록 온보딩  →  /plots/new
 *
 * [Description]
 * - **퍼블(마크업) 단계다.** 지도 연결·좌표 변환·저장·임시 저장은 전부 빠져 있다.
 *   이 페이지가 책임지는 것은 화면 구조와 상태별 모양까지다.
 * - 스펙은 네 단계 마법사인데, **단계 전환이 로직**이라 여기서는 네 단계를
 *   모두 펼쳐 둔다. 그래야 퍼블 검토에서 모든 화면을 한 번에 볼 수 있다.
 *   로직이 붙으면 각 `<Step>` 을 한 번에 하나씩 보이게 하고 단계 레일이
 *   현재 위치를 받으면 된다.
 * - `"use client"` 가 없다. 작물 카드·재배 방식까지 CSS 로 처리해서 이 화면은
 *   JS 없이도 전부 보이고 조작된다.
 * - `(app)` 그룹 안이라 로그인·동의를 거쳐야 들어온다(레이아웃이 검사한다).
 *
 * [연결하는 사람에게]
 * - 지도는 `PlotMapFrame` 의 `PLOT_MAP_CONTAINER_ID` div 에 붙인다. 지도 중심이
 *   곧 밭 좌표다(중앙 핀 방식).
 * - 저장은 이 파일의 `<form>` 에 action 을 달면 된다. 입력 이름:
 *   latitude · longitude · name · areaM2 · areaUnit · crops(복수) ·
 *   sowingDate · sowingUnknown · sowingMethod
 * ---------------------------------------------
 */

export const metadata: Metadata = {
  title: "텃밭 등록",
  description: "지도에서 밭 위치를 지정하고 작물과 파종일을 등록합니다.",
};

const STEPS = [
  { no: 1, labelKo: "위치 지정" },
  { no: 2, labelKo: "텃밭 정보" },
  { no: 3, labelKo: "작물 선택" },
  { no: 4, labelKo: "재배 정보" },
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

      <StepRail />

      <form className="mt-8 flex flex-col gap-10">
        <Step
          descriptionKo="지도를 움직여 밭을 한가운데 맞춰 주세요. 밭이 작아 한 지점만 받습니다."
          no={1}
          titleKo="밭 위치 지정"
        >
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <PlotMapFrame />
            <div className="self-start">
              <LocationSummary />
            </div>
          </div>
        </Step>

        <Step
          descriptionKo="나중에 바꿀 수 있습니다. 건너뛰셔도 됩니다."
          no={2}
          optional
          titleKo="텃밭 정보"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              icon={<FieldIcon />}
              label="텃밭 이름"
              name="name"
              placeholder="예: 낙동강변 배추밭"
            />
            <div className="flex flex-col gap-1.5">
              <label
                className="font-medium text-fg text-sm"
                htmlFor="plot-area"
              >
                대략 면적
              </label>
              <div className="flex gap-2">
                <input
                  className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2.5 text-fg placeholder:text-fg-subtle transition-colors hover:border-accent focus:border-accent"
                  id="plot-area"
                  inputMode="numeric"
                  name="areaM2"
                  placeholder="예: 200"
                  type="number"
                />
                {/* 평과 ㎡ 를 둘 다 받는다. 농민은 평으로 알고 계신 경우가 많은데
                    ㎡ 로만 받으면 매번 암산하게 된다. */}
                <select
                  aria-label="면적 단위"
                  className="shrink-0 rounded-md border border-border bg-surface px-3 py-2.5 text-fg text-sm transition-colors hover:border-accent focus:border-accent"
                  defaultValue="pyeong"
                  name="areaUnit"
                >
                  <option value="pyeong">평</option>
                  <option value="m2">㎡</option>
                </select>
              </div>
              <p className="text-fg-muted text-xs">
                어림잡으셔도 됩니다. 물 주는 양을 가늠하는 데만 씁니다.
              </p>
            </div>
          </div>
        </Step>

        <Step
          descriptionKo="여러 개 고르실 수 있습니다."
          no={3}
          titleKo="작물 선택"
        >
          <fieldset>
            <legend className="sr-only">재배할 작물</legend>
            <CropCards defaultSelected={["cabbage"]} />
          </fieldset>
        </Step>

        <Step
          descriptionKo="파종일을 아시면 그날부터 적산온도를 쌓습니다."
          no={4}
          titleKo="재배 정보"
        >
          <div className="max-w-md">
            <SowingFields />
          </div>
        </Step>

        <div className="flex flex-col gap-3 border-border border-t pt-6 sm:flex-row-reverse sm:items-center">
          <Button fullWidth size="lg" type="submit">
            텃밭 등록하기
          </Button>
          <p className="text-fg-subtle text-xs sm:mr-auto">
            입력하신 내용은 자동으로 임시 저장됩니다.
          </p>
        </div>
      </form>
    </main>
  );
}

/**
 * 단계 안내.
 *
 * 진행 상태는 아직 정적이다(1단계 활성). 로직이 붙으면 현재 단계를 받는다.
 * 좁은 화면에서 줄바꿈되므로 연결선은 `hidden sm:block` 으로 뺀다 —
 * 줄이 바뀐 자리에 선만 덩그러니 남으면 끊긴 것처럼 보인다.
 */
function StepRail() {
  return (
    <ol className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-3">
      {STEPS.map((step, index) => (
        <li className="flex items-center gap-2" key={step.no}>
          <span
            className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 font-medium text-sm ${
              step.no === 1
                ? "border-accent bg-accent-subtle text-accent"
                : "border-border text-fg-subtle"
            }`}
          >
            <span
              aria-hidden="true"
              className={`grid size-5 place-items-center rounded-full font-mono text-[0.7rem] ${
                step.no === 1
                  ? "bg-accent text-accent-on"
                  : "bg-surface-2 text-fg-subtle"
              }`}
            >
              {step.no}
            </span>
            {step.labelKo}
          </span>
          {index < STEPS.length - 1 && (
            <span
              aria-hidden="true"
              className="hidden h-px w-5 bg-border-strong sm:block"
            />
          )}
        </li>
      ))}
    </ol>
  );
}

function Step({
  no,
  titleKo,
  descriptionKo,
  optional,
  children,
}: {
  no: number;
  titleKo: string;
  descriptionKo: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`step-${no}`}>
      <div className="mb-4 flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-accent font-mono text-[0.75rem] text-accent-on"
        >
          {no}
        </span>
        <div>
          <h2
            className="font-semibold text-[1.1rem] text-fg tracking-tight"
            id={`step-${no}`}
          >
            {titleKo}
            {optional && (
              <span className="ml-2 font-mono font-normal text-fg-subtle text-xs">
                (건너뛰기 가능)
              </span>
            )}
          </h2>
          <p className="mt-0.5 text-fg-muted text-sm">{descriptionKo}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
