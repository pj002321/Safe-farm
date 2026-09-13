"use client";

import { Button } from "@/components/shared/Button";
import { revealedAt, TIMELINE, tally } from "@/features/report/domain/timeline";
import { useStepPlayback } from "@/shared/hooks/useStepPlayback";
import { DataTrace } from "./DataTrace";
import { FarmerPanel } from "./FarmerPanel";

/**
 * ---------------------------------------------
 * [Feature]: 리포트 생성 과정 재생 무대
 *
 * [Description]
 * - 왼쪽(농민 화면)과 오른쪽(데이터 추적)이 **같은 재생 상태**를 본다. 상태를 둘로
 *   나누면 애니메이션이 미세하게 어긋나면서 "이 계산이 저 문장을 만들었다"는 연결이
 *   깨진다. 그래서 재생 상태는 여기 한 곳에만 있다.
 * - 자동 재생하되 **건너뛰기와 다시보기를 항상 제공한다.** 자동 재생만 있으면
 *   두 번째 방문자는 이미 본 연출을 또 기다려야 한다.
 * - `prefers-reduced-motion` 처리는 useStepPlayback 안에 있다 — 그 사용자에겐
 *   처음부터 전부 열려 있고, 여기 버튼은 그대로 동작한다.
 * - 오른쪽 패널은 어두운 면(space 토큰)이다. 관측 장비의 화면이라는 은유이고,
 *   왼쪽 밝은 앱 화면과 역할이 다르다는 걸 색으로 먼저 알린다.
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

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-30 border-border-c border-b bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 sm:px-8">
          <div className="min-w-0">
            <p className="font-semibold text-[0.95rem] text-fg">
              오늘의 리포트
            </p>
            <p className="text-[0.78rem] text-fg-subtle">
              나농민님 · 경북 상주 · 배추밭
            </p>
          </div>

          <p
            aria-live="polite"
            className="rounded-md border border-border-c bg-surface px-2.5 py-1 font-mono text-[0.7rem] text-fg-muted tabular-nums"
          >
            받아온 값 {counts.fetch} · 계산 {counts.compute} · {completed}/
            {TIMELINE.length}
          </p>

          <div className="ml-auto flex gap-2">
            {!isDone && (
              <Button onClick={skipToEnd} size="sm" variant="ghost">
                건너뛰기
              </Button>
            )}
            {isDone && (
              <Button onClick={replay} size="sm" variant="outline">
                다시 보기
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* 최소 높이는 **2열일 때만** 준다. 안 주면 오른쪽 어두운 패널이 내용
          높이에서 끊겨 아래로 배경이 드러난다. 반대로 세로로 쌓이는 좁은 화면에
          그대로 적용하면 두 칸이 각각 화면 높이를 차지해 거대한 빈 공간이 생긴다. */}
      <div className="mx-auto grid max-w-7xl grid-cols-1 lg:min-h-[calc(100vh-4rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <section
          aria-label="농민이 보는 화면"
          className="min-w-0 border-border-c px-5 py-7 sm:px-8 lg:border-r"
        >
          <div className="mx-auto max-w-md">
            <FarmerPanel open={open} />
          </div>
        </section>

        <section
          aria-label="데이터 추적"
          className="min-w-0 border-space-border border-t bg-space px-5 py-7 sm:px-8 lg:border-t-0"
        >
          <div className="max-w-xl">
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
          </div>
        </section>
      </div>
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
