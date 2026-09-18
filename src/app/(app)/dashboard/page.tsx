import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import {
  ForecastFallback,
  ForecastPanel,
} from "@/components/dashboard/ForecastPanel";
import { HazardBannerSlot } from "@/components/dashboard/HazardBannerSlot";
import {
  PLOT_ONBOARDING_PATH,
  PlotStrip,
} from "@/components/dashboard/PlotStrip";
import {
  DataFreshness,
  DeviationBanner,
} from "@/components/dashboard/StatusBanners";
import { SAMPLE_FRESHNESS } from "@/components/dashboard/sample";
import { TaskBoard } from "@/components/dashboard/TaskBoard";
import { MapPinIcon } from "@/components/icons";
import { ButtonLink } from "@/components/shared/Button";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { emptyTaskReason } from "@/features/dashboard/domain/emptyTaskReason";
import {
  groupTasksByPlot,
  totalOpenCount,
} from "@/features/dashboard/domain/taskGrouping";
import { listTaskCards } from "@/features/dashboard/taskStore";
import {
  findCalendarByNameKo,
  stageAt,
} from "@/features/growth/domain/growthStage";
import { toPlotStripItem } from "@/features/plots/domain/plotStrip";
import {
  daysSincePlanting,
  type PlotCard,
} from "@/features/plots/domain/plotSummary";
import { listPlotCards } from "@/features/plots/plotStore";
import { displayNameOf } from "@/shared/auth/profile";
import { getCurrentProfile } from "@/shared/auth/profileStore";
import { toggleTask } from "./actions";

/**
 * ---------------------------------------------
 * [Feature]: 앱 홈(대시보드)  →  /dashboard
 *
 * [Description]
 * - **텃밭 줄과 할 일 카드가 실제 조회다.** `plot_tasks` 를 읽어 `TaskBoard` 에
 *   넘긴다. 특보·주말 예보·데이터 기준 시각은 아직 `components/dashboard/sample.ts`
 *   의 고정 데이터다 — 각자 자기 단계(특보 Step 6·예보 Step 5·기준시각 Step 9)에서
 *   조회가 붙는다. 로그인·동의 검사만 진짜다(그건 레이아웃이 한다).
 * - 생육 단계는 여기서 낸다. `features/plots` 가 `features/growth` 를 import 할
 *   수 없어서(features 끼리 금지) app 계층인 이 파일이 둘을 잇는다.
 * - 화면 순서가 곧 급한 순서다: **특보 → 내 밭 → 오늘 할 일 → 주말 날씨**.
 *   특보를 아래에 두면 스크롤하지 않은 사람이 못 본다.
 * - 할 일이 주인공이라 반반이 아니다. 오른쪽 예보는 "토·일에 나갈 수 있나"를
 *   판단하는 보조 정보다.
 * - **밭이 하나도 없으면 온보딩으로 보낸다.** 모든 로그인 경로(이메일·구글·동의
 *   게이트)가 결국 여기로 오므로, 분기를 여기 한 곳에 두면 전부 커버된다.
 *   각 로그인 화면에 흩뿌리면 한 곳을 빠뜨렸을 때 조용히 어긋난다.
 *   `/plots/new` 는 이 화면으로 되돌리지 않으므로 순환하지 않는다.
 * - 그래도 `PlotStrip` 의 빈 상태는 남겨 뒀다. 아래 조회가 실패하면 리다이렉트를
 *   포기하고 화면을 그리는데, 그때 보여 줄 것이 필요하다.
 * - `"use client"` 가 없다. 더보기는 CSS(`<details>`), 완료 체크는 폼 제출
 *   (Server Action)이라 둘 다 JS 없이 동작한다.
 * ---------------------------------------------
 */

export const metadata: Metadata = { title: "대시보드" };

/**
 * 밭의 대표 작물로 생육 단계를 낸다. 모르면 null 이고 배지를 안 그린다.
 *
 * ⚠️ 아직 **날짜 기반** 달력이라 상추·배추 둘만 걸린다. 누적 GDD 와
 * `crop_stages` 가 붙으면 이 함수째로 사라질 자리다.
 */
function stageKoOf(plot: PlotCard, now: Date): string | null {
  const calendar = findCalendarByNameKo(
    plot.cultivations[0]?.cropNameKo ?? null,
  );
  const days = daysSincePlanting(plot, now);
  if (!calendar || days === null) return null;
  return stageAt(calendar, days).nameKo;
}

/** 위성 위상차가 길게 벌어졌을 때만 나온다. null 이면 배너를 그리지 않는다. */
const SAMPLE_DEVIATION =
  "배추밭 생육이 인근 평균보다 6일 느립니다. 위성 관측이 5일 넘게 이어져 알려 드립니다.";

export default async function DashboardPage({
  searchParams,
}: PageProps<"/dashboard">) {
  const profile = await getCurrentProfile();
  // 고른 밭. 쿼리는 사용자가 고칠 수 있는 값이라 그대로 믿지 않는다 —
  // `ForecastPanel` 이 내 밭 목록에서 찾아 확인하고, 없으면 최신 밭으로 돌아간다.
  const params = await searchParams;
  const requestedPlotId = Array.isArray(params.plot)
    ? params.plot[0]
    : params.plot;

  // 화면이 함께 쓰므로 블록 밖에 둔다. 조회가 실패하면 빈 배열 그대로 그려서
  // 홈이 통째로 죽지 않게 한다(아래 catch 와 같은 이유).
  let plots: PlotCard[] = [];

  // 등록한 밭이 없으면 온보딩으로. 판단에 필요한 것은 0 인지 아닌지뿐이다.
  //
  // ⚠️ 조회가 실패해도 **리다이렉트를 포기하고 화면을 그린다.** plots 테이블이
  //    아직 없거나(마이그레이션 미적용) DB 가 잠깐 흔들릴 때, 홈 화면이 통째로
  //    500 이 되는 것보다 낫다. 증상을 숨기는 것이 아니라 더 나쁜 결과를 피하는
  //    것이므로 원인을 로그에 남긴다.
  if (profile) {
    let plotCount: number | null = null;
    try {
      plots = await listPlotCards(profile.id);
      plotCount = plots.length;
    } catch (error) {
      console.error("[dashboard] 텃밭 목록 조회 실패", error);
    }
    if (plotCount === 0) redirect(PLOT_ONBOARDING_PATH);
  }

  // 위 plots 조회와 같은 이유로 실패해도 빈 배열로 화면을 그린다.
  let tasks: Awaited<ReturnType<typeof listTaskCards>> = [];
  if (profile) {
    try {
      tasks = await listTaskCards(profile.id);
    } catch (error) {
      console.error("[dashboard] 할 일 카드 조회 실패", error);
    }
  }

  // 밭별로 묶는다. 카드가 없는 밭도 자리를 남기려고 밭 목록을 함께 넘긴다.
  const taskGroups = groupTasksByPlot(tasks, plots);
  const openCount = totalOpenCount(taskGroups);
  // 카드가 없을 때 화면이 뭐라고 말할지. 추가 조회 없이 이미 읽은 밭 정보로 낸다.
  const emptyReason = emptyTaskReason(plots);

  const now = new Date();
  const stripItems = plots.map((plot) =>
    toPlotStripItem(plot, now, stageKoOf(plot, now)),
  );

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-7 px-6 py-6 sm:py-8">
      {/* ── 최상단 고정 알림 ─────────────────────────
          특보만 여기 둔다. 생육 편차(중 우선순위)까지 위에 쌓으면 화면 맨 위를
          두 덩어리가 먹어, 정작 봐야 할 할 일이 접힌 곳 아래로 밀린다.
          편차는 텃밭 생육 얘기라 아래 텃밭 섹션이 제자리다. */}
      {profile && (
        <Suspense fallback={null}>
          <HazardBannerSlot
            requestedPlotId={requestedPlotId}
            userId={profile.id}
          />
        </Suspense>
      )}

      {/* ── 머리말 ─────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <SectionHeading
            description="오늘 밭에서 해야 할 일을, 그렇게 판단한 근거와 함께 보여 드립니다."
            eyebrow="today"
            title={profile ? `${displayNameOf(profile)}님의 밭` : "내 밭"}
          />
          <div className="mt-3">
            <DataFreshness
              baseKo={SAMPLE_FRESHNESS.baseKo}
              sourceKo={SAMPLE_FRESHNESS.sourceKo}
              stale={SAMPLE_FRESHNESS.stale}
            />
          </div>
        </div>

        {/* 등록과 관리를 나란히. 밭이 하나라도 있으면 관리가 더 자주 쓰인다. */}
        <div className="flex flex-wrap items-center gap-2">
          {plots.length > 0 && (
            <ButtonLink href="/plots" variant="secondary">
              텃밭 관리
            </ButtonLink>
          )}
          <ButtonLink
            href={PLOT_ONBOARDING_PATH}
            icon={<MapPinIcon />}
            variant="primary"
          >
            텃밭 등록
          </ButtonLink>
        </div>
      </div>

      {/* ── 텃밭 요약 ──────────────────────────────── */}
      <section aria-labelledby="plots-heading">
        <h2 className="mb-3 font-semibold text-fg text-sm" id="plots-heading">
          내 텃밭
          <span className="ml-1.5 font-mono text-fg-subtle text-xs">
            {plots.length}
          </span>
        </h2>
        <PlotStrip plots={stripItems} />
        <div className="mt-3">
          <DeviationBanner deviationKo={SAMPLE_DEVIATION} />
        </div>
      </section>

      {/* ── 할 일 + 주말 예보 ──────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:gap-8">
        <section aria-labelledby="tasks-heading">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="font-semibold text-fg text-sm" id="tasks-heading">
              오늘 할 일
              <span className="ml-1.5 font-mono text-fg-subtle text-xs">
                {openCount}
              </span>
            </h2>
            <div className="flex items-baseline gap-3">
              <p className="font-mono text-[0.68rem] text-fg-subtle">
                매일 00시 갱신 · 우선순위순
              </p>
              <Link
                className="text-[0.68rem] text-fg-muted underline underline-offset-2 hover:text-fg"
                href="/dashboard/history"
              >
                이전 기록
              </Link>
            </div>
          </div>
          <TaskBoard
            emptyReason={emptyReason}
            groups={taskGroups}
            toggleTaskAction={toggleTask}
          />
        </section>

        <section aria-labelledby="forecast-heading">
          <h2
            className="mb-3 font-semibold text-fg text-sm"
            id="forecast-heading"
          >
            밭에 나갈 수 있는 날
          </h2>

          {/* 예보는 외부 호출이라 느릴 수 있다. 경계를 따로 둬서 할 일·텃밭이
              이 호출을 기다리지 않게 한다.

              ⚠️ `key` 가 **핵심이다.** 없으면 밭을 바꿔도 React 가 같은 경계를
              재사용해, 새 예보가 도착할 때까지 이전 밭 값이 그대로 남는다. 밭마다
              다른 key 를 주면 경계가 새로 떠서 `ForecastFallback`(위성 스캔
              애니메이션)이 보이고, 지금 읽는 중임이 드러난다. 예열을 없앤 뒤로는
              밭을 바꿀 때 실제로 기다림이 생기므로 이 표시가 있어야 한다. */}
          {profile && (
            <Suspense
              fallback={<ForecastFallback />}
              key={requestedPlotId ?? "default"}
            >
              <ForecastPanel
                requestedPlotId={requestedPlotId}
                userId={profile.id}
              />
            </Suspense>
          )}

          <p className="mt-3 rounded-md bg-surface-2 px-3.5 py-3 text-fg-muted text-xs leading-relaxed">
            고른 밭의 좌표 기준 예보입니다. 동네 평균이 아니라 밭 기준이라, 야외
            작업을 언제 할지 정하는 데 그대로 쓸 수 있습니다.
          </p>
        </section>
      </div>

      <div className="border-border border-t pt-6"></div>
    </main>
  );
}
