import type { Metadata } from "next";
import Link from "next/link";
import { FieldIcon, MapPinIcon, SproutIcon } from "@/components/icons";
import { CropChips } from "@/components/plot/CropChips";
import { PlotMapFrame } from "@/components/plot/PlotMapFrame";
import { Badge } from "@/components/shared/Badge";
import { Button } from "@/components/shared/Button";
import { Field } from "@/components/shared/Field";
import { SectionHeading } from "@/components/shared/SectionHeading";

/**
 * ---------------------------------------------
 * [Feature]: 밭 등록  →  /plots/new
 *
 * [Description]
 * - **퍼블(마크업) 단계다.** 지도 연결·주소 변환·저장은 전부 빠져 있다. 이 페이지가
 *   책임지는 것은 화면 구조와 상태별 모양까지다.
 * - `"use client"` 가 없다. 작물 칩까지 CSS 로 처리했기 때문에 이 화면은 JS 없이도
 *   전부 보이고 조작된다. 로직이 붙을 때 필요한 만큼만 클라이언트로 내리면 된다.
 * - `(app)` 그룹 안이라 **로그인해야 들어온다**(proxy 가 공개 목록에 없는 경로를 막는다).
 *   내 밭을 등록하는 화면이므로 맞는 자리다.
 * - 참고 시안은 `data-theme="dark"` 를 강제했는데 걷어냈다. 우리 토큰을 쓰면 사용자가
 *   고른 테마를 따라가고, 기본값인 라이트에서 훨씬 밝게 읽힌다.
 * - 시안이 지도 위에 얹었던 검색창·현재위치 버튼은 지도 밖으로 내렸다. 지도를 가리고,
 *   모바일에서는 핀을 찍을 자리를 뺏는다.
 *
 * [연결하는 사람에게]
 * - 지도는 `PlotMapFrame` 의 `PLOT_MAP_CONTAINER_ID` div 에 붙인다.
 * - 저장은 이 파일의 `<form>` 에 action 을 달면 된다. 입력 이름은
 *   name · address · areaM2 · crops(복수) 다.
 * ---------------------------------------------
 */

export const metadata: Metadata = {
  title: "밭 등록",
  description: "지도에서 밭 위치를 찍고 작물을 선택해 등록합니다.",
};

export default function PlotRegisterPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeading
          description="지도에서 위치를 찍고 작물을 고르면, 그 자리의 날씨로 리포트를 만듭니다."
          eyebrow="plot / register"
          title="내 밭 등록"
        />
        <Link
          className="text-fg-muted text-sm transition-colors hover:text-accent"
          href="/dashboard"
        >
          ← 대시보드
        </Link>
      </div>

      <StepRail />

      {/* 지도가 주인공이라 반반이 아니다. 오른쪽은 지도에서 정해진 값을 받아 적는 칸이다. */}
      <form className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section aria-labelledby="plot-location-heading">
          <h2 className="sr-only" id="plot-location-heading">
            밭 위치 선택
          </h2>
          <PlotMapFrame />
        </section>

        <aside className="flex flex-col gap-5 self-start rounded-lg border border-border bg-surface p-5 shadow-e1 sm:p-6">
          <SelectedLocation />

          <Field
            icon={<FieldIcon />}
            label="밭 이름"
            name="name"
            placeholder="예: 낙동강변 배추밭"
          />

          <Field
            hint="평으로 알고 계시면 1평 ≈ 3.3㎡ 로 환산해 주세요."
            inputMode="numeric"
            label="면적 (㎡)"
            name="areaM2"
            placeholder="예: 660"
            type="number"
          />

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-medium text-fg text-sm">
              작물 선택
              <span className="ml-1.5 font-mono text-fg-subtle text-xs">
                (여러 개)
              </span>
            </legend>
            <CropChips defaultSelected={["cabbage"]} />
          </fieldset>

          <p className="flex gap-2 rounded-md bg-telemetry-subtle px-3.5 py-3 text-telemetry text-xs leading-relaxed">
            <SproutIcon className="mt-0.5 shrink-0" />
            씨앗으로 뿌릴지 모종을 심을지는 다음 단계에서 고릅니다. 그때부터
            적산온도가 쌓이기 시작합니다.
          </p>

          <Button fullWidth size="lg" type="submit">
            밭 등록하기
          </Button>
        </aside>
      </form>
    </main>
  );
}

/**
 * 단계 안내.
 *
 * 참고 시안에는 없었다. 넣은 이유는 이 화면이 "지도에서 찍는다 → 정보를 적는다"
 * 두 박자로 움직이는데, 처음 들어온 사람에게는 지도만 크게 보여서 오른쪽 칸을
 * 놓치기 때문이다. 진행 상태는 아직 정적이다(로직 붙을 때 현재 단계를 받는다).
 */
function StepRail() {
  const steps = [
    { no: 1, labelKo: "위치 찍기", active: true },
    { no: 2, labelKo: "밭 정보", active: false },
    { no: 3, labelKo: "작물 고르기", active: false },
  ];

  return (
    <ol className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-3">
      {steps.map((step, index) => (
        <li className="flex items-center gap-2" key={step.no}>
          <span
            className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 font-medium text-sm ${
              step.active
                ? "border-accent bg-accent-subtle text-accent"
                : "border-border text-fg-subtle"
            }`}
          >
            <span
              aria-hidden="true"
              className={`grid size-5 place-items-center rounded-full font-mono text-[0.7rem] ${
                step.active
                  ? "bg-accent text-accent-on"
                  : "bg-surface-2 text-fg-subtle"
              }`}
            >
              {step.no}
            </span>
            {step.labelKo}
          </span>
          {index < steps.length - 1 && (
            <span aria-hidden="true" className="h-px w-5 bg-border-strong" />
          )}
        </li>
      ))}
    </ol>
  );
}

/**
 * 지도에서 고른 위치를 받아 적는 칸.
 *
 * 시안은 `readonly input` 하나였는데, 회색 비활성 입력으로 두면 화면에서 가장 중요한
 * 값이 가장 흐리게 보인다. 지도 조작의 **결과**이자 등록의 근거이므로 강조 카드로
 * 올렸다. 아직 값이 없는 상태의 모양이다.
 */
function SelectedLocation() {
  return (
    <div className="rounded-md border border-accent/40 border-dashed bg-accent-subtle px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[0.65rem] text-accent uppercase tracking-[0.12em]">
          선택된 위치
        </span>
        <Badge size="sm" tone="neutral">
          미선택
        </Badge>
      </div>

      <p className="mt-2 flex items-center gap-1.5 font-medium text-fg-muted text-sm">
        <MapPinIcon className="shrink-0 text-accent" />
        지도를 눌러 위치를 선택하세요
      </p>

      {/* 값이 들어오면 이 자리에 주소와 좌표가 찍힌다. 자리를 미리 잡아 두면
          선택 전후로 패널 높이가 튀지 않는다. */}
      <p className="mt-1 font-mono text-[0.7rem] text-fg-subtle tabular-nums">
        위도 —, 경도 —
      </p>

      {/* 폼 제출에 실릴 값. 지도가 이 input 의 value 를 채운다. */}
      <input name="address" type="hidden" />
    </div>
  );
}
