"use client";

import { useState } from "react";
import { ArrowRightIcon, ChevronDownIcon } from "@/components/icons";
import { GlobeScene } from "@/components/landing/globe";
import { SitePanel } from "@/components/landing/SitePanel";
import { Badge } from "@/components/shared/Badge";
import { ButtonLink } from "@/components/shared/Button";
import {
  type HazardLevel,
  OBSERVATION_SITES,
} from "@/features/monitoring/domain/hazards";

/**
 * ---------------------------------------------
 * [Feature]: 랜딩 히어로 (밤하늘 + 3D 관측 지구본)
 *
 * [Description]
 * - 이 페이지에서 상태를 가진 유일한 이유는 "어느 관측 지점을 보고 있는가" 하나다.
 *   그 상태를 지구본과 상세 패널, 그리고 아래 칩 목록이 함께 읽는다.
 * - **첫 화면이 비어 있지 않게** 초기 선택을 null 로 두지 않고 경보 등급이 가장 높은
 *   지점으로 잡는다. 사용자가 지구본을 돌려 우연히 마커를 누르기 전까지 오른쪽이
 *   비어 있으면, 이 서비스가 무엇을 보여주는지 알 방법이 없다.
 * - **3D 캔버스는 키보드로 조작할 수 없다.** 그래서 지구본 아래에 관측 지점 이름
 *   버튼을 가로 스크롤 칩으로 둔다. 장식이 아니라 이 영역의 유일한 키보드·스크린리더
 *   접근 경로이므로 절대 제거하지 말 것. 선택 상태는 `aria-pressed` 로 알린다.
 * - 어두운 배경 위에서는 Button 의 `outline` 이 border-strong(밝은 회색)을 쓰므로
 *   대비가 모자란다. Button.tsx 를 고치는 대신 감싸는 div 에서 자식 앵커의 색만
 *   space 토큰으로 덮는다 — 이 예외는 히어로 한 곳뿐이다.
 *
 * [Usage]
 * ```tsx
 * <Hero />
 * ```
 * ---------------------------------------------
 */

/** 경보 3단계의 심각도 순서. 초기 선택을 고르는 데만 쓴다. */
const LEVEL_RANK: Record<HazardLevel, number> = {
  watch: 0,
  advisory: 1,
  warning: 2,
};

/** 관측 지점 중 가장 급한 곳. 목록이 비면 null(패널이 그려지지 않는다). */
const INITIAL_SITE_ID =
  OBSERVATION_SITES.reduce<(typeof OBSERVATION_SITES)[number] | null>(
    (worst, site) =>
      worst === null || LEVEL_RANK[site.level] > LEVEL_RANK[worst.level]
        ? site
        : worst,
    null,
  )?.id ?? null;

/** 히어로 하단 계측 스트립. 문구가 늘면 이 배열만 고친다. */
const TELEMETRY: readonly { label: string; value: string }[] = [
  { label: "관측 위성", value: "천리안 2A · 아리랑 3A" },
  { label: "해상도", value: "10 m" },
  { label: "갱신", value: "1일 2회" },
  { label: "커버리지", value: "전국 17개 시도" },
];

export function Hero() {
  const [selectedId, setSelectedId] = useState<string | null>(INITIAL_SITE_ID);
  const selectedSite =
    OBSERVATION_SITES.find((site) => site.id === selectedId) ?? null;

  return (
    <section
      className="relative isolate w-full overflow-hidden bg-space"
      id="top"
    >
      {/* 방사형 글로우 2개. 밤하늘이 완전한 검정이면 화면이 죽어 보인다. */}
      <div
        aria-hidden="true"
        className="-top-40 -left-32 pointer-events-none absolute size-[36rem] rounded-full bg-accent opacity-20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/3 right-[-10rem] size-[30rem] rounded-full bg-telemetry opacity-10 blur-3xl"
      />
      {/* 다음(밝은) 섹션으로 넘어가는 페이드. 경계선이 생기지 않게 한다. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-bg"
      />

      <div className="relative mx-auto flex min-h-[100svh] w-full max-w-6xl flex-col justify-center gap-12 px-6 pt-24 pb-28 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.12fr)] lg:content-center lg:items-center lg:gap-16">
        <div className="flex flex-col items-start gap-6">
          <Badge dot tone="telemetry">
            실시간 위성 관측
          </Badge>

          <h1 className="font-semibold text-4xl text-space-fg tracking-tight sm:text-5xl xl:text-display">
            위성이 보는 땅,
            <br />
            AI가 읽는{" "}
            <span className="bg-gradient-to-r from-accent to-telemetry bg-clip-text text-transparent">
              내일
            </span>
            .
          </h1>

          <p className="max-w-xl text-pretty text-base text-space-muted leading-relaxed sm:text-lg">
            인공위성이 매일 당신의 땅을 관측합니다. Safe Farm AI는 토지와 작물의
            생육 상태를 읽고, 자연재해가 닥치기 전에 무엇을 해야 할지
            알려드립니다.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <ButtonLink
              href="/login"
              iconEnd={<ArrowRightIcon />}
              size="lg"
              variant="primary"
            >
              무료로 시작하기
            </ButtonLink>
            <div className="[&>a]:border-space-border [&>a]:text-space-fg [&>a:hover]:border-telemetry [&>a:hover]:text-telemetry">
              <ButtonLink href="#report" size="lg" variant="outline">
                오늘의 리포트 보기
              </ButtonLink>
            </div>
          </div>

          <dl className="mt-4 grid w-full grid-cols-2 gap-x-6 gap-y-4 border-space-border border-t pt-6 font-mono text-space-muted text-xs sm:grid-cols-4">
            {TELEMETRY.map((item) => (
              <div className="flex flex-col gap-1" key={item.label}>
                <dt className="uppercase tracking-[0.14em]">{item.label}</dt>
                <dd className="text-space-fg tabular-nums">{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex flex-col gap-4">
          <div className="relative mx-auto aspect-square max-h-[24rem] w-full max-w-md sm:max-h-[30rem] lg:max-h-none lg:max-w-none">
            <GlobeScene
              className="size-full rounded-2xl border border-space-border"
              onSelect={setSelectedId}
              selectedId={selectedId}
              sites={OBSERVATION_SITES}
            />

            {selectedSite && (
              <div className="absolute right-3 bottom-3 left-3 sm:right-auto sm:bottom-4 sm:left-4 sm:w-[15rem]">
                <SitePanel
                  onClose={() => setSelectedId(null)}
                  site={selectedSite}
                />
              </div>
            )}
          </div>

          <SiteChips onSelect={setSelectedId} selectedId={selectedId} />
        </div>
      </div>

      <div
        aria-hidden="true"
        className="-translate-x-1/2 absolute bottom-6 left-1/2 flex animate-drift flex-col items-center gap-1 font-mono text-[0.7rem] text-space-muted uppercase tracking-[0.2em]"
      >
        아래로
        <ChevronDownIcon />
      </div>
    </section>
  );
}

/**
 * 지구본의 키보드·스크린리더 대체 컨트롤.
 *
 * 가로 스크롤 칩으로 둔 이유는 9곳을 세로로 쌓으면 히어로가 한 화면을 넘기 때문이다.
 * 선택 여부를 색만으로 알리지 않도록 `aria-pressed` 를 함께 준다.
 */
function SiteChips({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    // role="group" 대신 <fieldset>. 이름 없는 div 의 aria-label 은 보조기기가
    // 무시하고, biome a11y/useSemanticElements 도 네이티브 요소를 요구한다.
    <fieldset className="-mx-6 flex min-w-0 gap-2 overflow-x-auto px-6 pb-1 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
      <legend className="sr-only">관측 지점 선택</legend>
      {OBSERVATION_SITES.map((site) => {
        const active = site.id === selectedId;
        return (
          <button
            aria-pressed={active}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors duration-200 ease-out-expo ${
              active
                ? "border-telemetry bg-telemetry/15 text-telemetry"
                : "border-space-border text-space-muted hover:border-space-muted hover:text-space-fg"
            }`}
            key={site.id}
            onClick={() => onSelect(site.id)}
            type="button"
          >
            {site.nameKo}
          </button>
        );
      })}
    </fieldset>
  );
}
