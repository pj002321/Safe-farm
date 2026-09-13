"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/shared/Button";
import { revealedAt, TIMELINE, tally } from "@/features/report/domain/timeline";
import { useStepPlayback } from "@/shared/hooks/useStepPlayback";
import { useStickToBottom } from "@/shared/hooks/useStickToBottom";
import { DataTrace } from "./DataTrace";
import { FarmerPanel } from "./FarmerPanel";

/**
 * ---------------------------------------------
 * [Feature]: 리포트 생성 과정 재생 무대
 *
 * [Description]
 * - 화면 전체가 **어두운 무대**다. 그 위에 농민이 보는 화면을 기기 프레임으로 띄우고,
 *   옆으로 데이터 추적이 흐른다. 좌우를 반반 가르지 않는 이유는 둘의 무게가 다르기
 *   때문이다 — 왼쪽은 "결과물 하나", 오른쪽은 "계속 쌓이는 기록"이다.
 * - 기기 프레임은 **고정폭에 sticky** 다. 추적을 아래로 읽어 내려가는 동안에도
 *   "이 계산이 저 화면을 만들었다"는 대상이 눈앞에 남아 있어야 한다.
 * - 두 패널이 **각자 스크롤**한다. 새 단계가 쌓이면 자동으로 따라 내려가되,
 *   사용자가 위로 올려 지난 단계를 읽는 중이면 멈춘다(useStickToBottom).
 * - 재생 상태는 여기 한 곳에만 있다. 둘로 나누면 애니메이션이 어긋나면서
 *   두 패널의 연결이 깨진다.
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
  const open = revealedAt(TIMELINE, completed);
  const counts = tally(TIMELINE, completed);

  // 두 패널 모두 새 내용이 생기면 따라 내려간다.
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

      <header className="sticky top-0 z-30 border-space-border border-b bg-space/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[88rem] flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 sm:px-8">
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
            받아온 값 {counts.fetch} · 계산 {counts.compute} · {completed}/
            {TIMELINE.length}
          </p>

          <div className="ml-auto flex gap-2 [&>button]:border-space-border [&>button]:text-space-fg">
            {isDone ? (
              <Button onClick={replay} size="sm" variant="outline">
                다시 보기
              </Button>
            ) : (
              <Button onClick={skipToEnd} size="sm" variant="outline">
                건너뛰기
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* 비대칭 2열. 왼쪽은 결과물 하나(고정폭), 오른쪽은 계속 쌓이는 기록(가변).
          `grid-rows-[minmax(0,1fr)]` 가 핵심이다 — 기본값 auto 면 행이 내용
          높이만큼 늘어나 컨테이너를 넘치고, 자식의 h-full 도 그 늘어난 값을
          따라간다. 그러면 패널이 안에서 스크롤되지 않고 페이지가 밀린다. */}
      <div className="mx-auto grid w-full max-w-[88rem] grid-cols-1 gap-8 px-5 py-8 sm:px-8 lg:min-h-0 lg:flex-1 lg:grid-cols-[22.5rem_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-12 xl:grid-cols-[24rem_minmax(0,1fr)]">
        <section aria-label="농민이 보는 화면" className="min-w-0">
          <div className="lg:flex lg:h-full lg:flex-col lg:justify-start">
            <DeviceFrame>
              <div
                className="max-h-[min(34rem,65vh)] overflow-y-auto px-4 py-5 lg:max-h-[calc(100%-2.5rem)]"
                ref={screenRef}
              >
                <FarmerPanel open={open} />
              </div>
            </DeviceFrame>

            <p className="mt-3 text-center font-mono text-[0.68rem] text-space-muted">
              농민에게 나가는 화면
            </p>
          </div>
        </section>

        <section
          aria-label="데이터 추적"
          className="min-w-0 lg:h-full lg:overflow-y-auto lg:pr-2"
          ref={traceRef}
        >
          <DataTrace completed={completed} steps={TIMELINE} />

          {isDone && (
            <div className="mt-8 animate-rise border-space-border border-t pt-5">
              <h3 className="font-mono text-[0.7rem] text-space-muted uppercase tracking-[0.14em]">
                이 화면이 쓴 것
              </h3>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 font-mono text-[0.72rem]">
                {SOURCES.map((s) => (
                  <div className="contents" key={s.nameKo}>
                    <dt className="text-space-muted">{s.nameKo}</dt>
                    <dd className="text-space-fg/80">{s.detailKo}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/**
 * 기기 프레임.
 *
 * 아이폰을 흉내내지 않는다 — 노치·홈바 같은 장식은 몇 달이면 촌스러워진다.
 * 두꺼운 베젤과 둥근 모서리, 그리고 안쪽이 밝다는 것만으로 "이건 기기 화면"이
 * 전달된다. 안쪽은 `bg-bg` 라 사용자의 테마를 그대로 따른다.
 */
function DeviceFrame({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[1.75rem] border border-space-border bg-white/[0.04] p-2 shadow-e3 backdrop-blur-sm">
      <div className="overflow-hidden rounded-[1.25rem] bg-bg">{children}</div>
    </div>
  );
}

/** 푸터 출처. 라이선스 표기가 필요한 것은 상세에 적었다. */
const SOURCES: readonly { nameKo: string; detailKo: string }[] = [
  { nameKo: "기상청 API허브", detailKo: "상주(137) 일별 기온·강수 실측" },
  {
    nameKo: "Open-Meteo",
    detailKo: "밭 좌표 예보 · 풍향·풍속 · 일출입 (CC BY 4.0)",
  },
  {
    nameKo: "농촌진흥청",
    detailKo: "배추·단감 농작업 일정 — 적온, 작형, 재해 대책",
  },
  { nameKo: "Copernicus Sentinel-2", detailKo: "NDVI·NDWI (2차 연동 예정)" },
  { nameKo: "Claude", detailKo: "계산 결과를 문장으로 옮기는 일만 담당" },
];
