"use client";

import { useState } from "react";
import { revealedAt, TIMELINE, tally } from "@/features/report/domain/timeline";
import { useStepPlayback } from "@/shared/hooks/useStepPlayback";
import { useStickToBottom } from "@/shared/hooks/useStickToBottom";
import { DataTrace } from "./DataTrace";
import { DeviceFrame, type DeviceVariant } from "./DeviceFrame";
import { FarmerPanel } from "./FarmerPanel";

/**
 * ---------------------------------------------
 * [Feature]: 리포트 생성 과정 재생 무대
 *
 * [Description]
 * - 어두운 무대 위에 **기기 프레임이 주인공**이다. 기본은 PC 화면이고, 토글로
 *   모바일 프레임으로 바꿔 같은 화면을 두 기기에서 볼 수 있다.
 * - 오른쪽 추적은 **제목만** 쌓는 좁은 레일이다. 예전처럼 코드 블록을 다 펼치면
 *   정작 보여주려던 화면보다 덩치가 커진다.
 * - 두 영역이 각자 스크롤한다. 새 내용이 생기면 따라 내려가되, 사용자가 위로
 *   올려 읽는 중이면 멈춘다(useStickToBottom).
 * - 재생 상태는 여기 한 곳에만 있다. 둘로 나누면 애니메이션이 어긋나면서
 *   "이 계산이 저 화면을 만들었다"는 연결이 깨진다.
 *
 * [Usage]
 * ```tsx
 * <ReportStage />
 * ```
 * ---------------------------------------------
 */

export function ReportStage() {
  const { completed, isDone, replay, skipToEnd } = useStepPlayback(
    TIMELINE.length,
    { stepMs: 1100, startDelayMs: 500 },
  );
  const [device, setDevice] = useState<DeviceVariant>("desktop");

  const open = revealedAt(TIMELINE, completed);
  const counts = tally(TIMELINE, completed);

  const screenRef = useStickToBottom<HTMLDivElement>(open.size);
  const traceRef = useStickToBottom<HTMLDivElement>(completed);

  return (
    <div className="relative isolate flex min-h-screen flex-col overflow-hidden bg-space lg:h-screen lg:min-h-0">
      {/* 주변광. 랜딩 히어로와 같은 장치다 — 완전한 검정이면 화면이 죽는다. */}
      <div
        aria-hidden="true"
        className="-top-48 -left-40 pointer-events-none absolute size-[34rem] rounded-full bg-accent opacity-20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/3 right-[-12rem] size-[30rem] rounded-full bg-telemetry opacity-[0.07] blur-3xl"
      />

      <header className="shrink-0 border-space-border border-b bg-space/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[84rem] flex-wrap items-center gap-x-4 gap-y-3 px-5 py-3.5 sm:px-8">
          <div className="min-w-0">
            <p className="font-semibold text-[0.95rem] text-space-fg">
              오늘의 리포트
            </p>
            <p className="text-[0.78rem] text-space-muted">
              나농민님 · 경북 상주 · 배추밭
            </p>
          </div>

          <p
            aria-live="polite"
            className="rounded-full border border-space-border px-3 py-1 font-mono text-[0.7rem] text-space-muted tabular-nums"
          >
            {completed}/{TIMELINE.length} · 받아옴 {counts.fetch} · 계산{" "}
            {counts.compute}
          </p>

          <div className="ml-auto flex items-center gap-2">
            <DeviceToggle onChange={setDevice} value={device} />
            <button
              className="rounded-full border border-space-border px-3.5 py-1.5 text-[0.78rem] text-space-fg transition-colors duration-200 hover:border-space-muted"
              onClick={isDone ? replay : skipToEnd}
              type="button"
            >
              {isDone ? "다시 보기" : "건너뛰기"}
            </button>
          </div>
        </div>
      </header>

      {/* 기기 프레임이 넓게, 추적은 좁은 레일로. 반반이 아닌 이유는 둘의 무게가
          다르기 때문이다 — 왼쪽은 결과물이고 오른쪽은 진행 표시다.
          `grid-rows-[minmax(0,1fr)]` 가 없으면 행이 내용 높이만큼 늘어나
          컨테이너를 넘치고, 자식의 h-full 도 그 값을 따라가 안에서 스크롤되지 않는다. */}
      <div className="mx-auto grid w-full max-w-[84rem] grid-cols-1 gap-6 px-5 py-6 sm:px-8 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_15rem] lg:grid-rows-[minmax(0,1fr)] lg:gap-10">
        <section
          aria-label="농민이 보는 화면"
          className="flex min-h-0 min-w-0 flex-col"
        >
          <DeviceFrame urlKo="safe-farm-ai.web.app/today" variant={device}>
            <div
              className="h-full max-h-[70vh] overflow-y-auto px-4 py-5 sm:px-6 lg:max-h-none"
              ref={screenRef}
            >
              {/* 데스크톱 프레임에서는 내용을 조금 넓게 편다. 모바일 폭 그대로
                  두면 큰 화면 가운데 좁은 기둥만 서 있는 꼴이 된다. */}
              <div
                className={
                  device === "mobile" ? "mx-auto max-w-sm" : "mx-auto max-w-2xl"
                }
              >
                <FarmerPanel open={open} />
              </div>
            </div>
          </DeviceFrame>
        </section>

        <section
          aria-label="데이터 추적"
          className="min-w-0 lg:h-full lg:overflow-y-auto lg:pr-1"
          ref={traceRef}
        >
          <DataTrace completed={completed} steps={TIMELINE} />

          {isDone && (
            <div className="mt-6 animate-rise border-space-border border-t pt-4">
              <h3 className="font-mono text-[0.65rem] text-space-muted uppercase tracking-[0.14em]">
                출처
              </h3>
              <ul className="mt-2 space-y-1 font-mono text-[0.68rem] text-space-fg/70">
                {SOURCES.map((source) => (
                  <li key={source}>{source}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/**
 * PC · 모바일 전환.
 *
 * 네이티브 `<button>` 두 개에 `aria-pressed` 를 준다. div 에 role 을 얹는 것보다
 * 키보드 조작(Tab·Enter·Space)이 공짜로 따라오고, 보조기기도 눌림 상태를 읽는다.
 */
function DeviceToggle({
  value,
  onChange,
}: {
  value: DeviceVariant;
  onChange: (next: DeviceVariant) => void;
}) {
  const options: { id: DeviceVariant; labelKo: string }[] = [
    { id: "desktop", labelKo: "PC" },
    { id: "mobile", labelKo: "모바일" },
  ];

  return (
    <fieldset className="flex rounded-full border border-space-border p-0.5">
      <legend className="sr-only">화면 크기 선택</legend>
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            aria-pressed={active}
            className={`rounded-full px-3 py-1 text-[0.75rem] transition-colors duration-200 ${
              active
                ? "bg-space-fg/10 text-space-fg"
                : "text-space-muted hover:text-space-fg"
            }`}
            key={option.id}
            onClick={() => onChange(option.id)}
            type="button"
          >
            {option.labelKo}
          </button>
        );
      })}
    </fieldset>
  );
}

/** 이 화면이 쓴 데이터 출처. 라이선스 표기가 필요한 것은 괄호에 적었다. */
const SOURCES: readonly string[] = [
  "기상청 API허브 — 상주(137) 실측",
  "Open-Meteo — 밭 좌표 예보 (CC BY 4.0)",
  "농촌진흥청 — 농작업 일정 · 재해 대책",
  "Copernicus Sentinel-2 (2차 연동 예정)",
  "Claude — 문장으로 옮기는 일만 담당",
];
