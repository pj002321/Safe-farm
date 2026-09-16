import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/auth/SignOutButton";
import {
  PLOT_ONBOARDING_PATH,
  PlotStrip,
} from "@/components/dashboard/PlotStrip";
import {
  DataFreshness,
  DeviationBanner,
  HazardBanner,
} from "@/components/dashboard/StatusBanners";
import {
  SAMPLE_ALERT,
  SAMPLE_FRESHNESS,
  SAMPLE_TASKS,
  SAMPLE_WEEKEND,
} from "@/components/dashboard/sample";
import { TaskBoard } from "@/components/dashboard/TaskBoard";
import { WeekendForecast } from "@/components/dashboard/WeekendForecast";
import { MapPinIcon } from "@/components/icons";
import { ButtonLink } from "@/components/shared/Button";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { listPlotCards } from "@/features/plots/plotStore";
import { displayNameOf } from "@/shared/auth/profile";
import { getCurrentProfile } from "@/shared/auth/profileStore";

/**
 * ---------------------------------------------
 * [Feature]: 앱 홈(대시보드)  →  /dashboard
 *
 * [Description]
 * - **퍼블(마크업) 단계다.** 화면에 보이는 값은 `components/dashboard/sample.ts`
 *   의 고정 데이터이고, 조회가 붙으면 그 파일은 통째로 사라진다.
 *   로그인·동의 검사만 진짜다(그건 레이아웃이 한다).
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
 * - `"use client"` 가 없다. 완료 체크·더보기까지 CSS 로 처리해서 이 화면의
 *   상호작용은 JS 없이 동작한다.
 * ---------------------------------------------
 */

export const metadata: Metadata = { title: "대시보드" };

/** 위성 위상차가 길게 벌어졌을 때만 나온다. null 이면 배너를 그리지 않는다. */
const SAMPLE_DEVIATION =
  "배추밭 생육이 인근 평균보다 6일 느립니다. 위성 관측이 5일 넘게 이어져 알려 드립니다.";

export default async function DashboardPage() {
  const profile = await getCurrentProfile();

  // 등록한 밭이 없으면 온보딩으로. 판단에 필요한 것은 0 인지 아닌지뿐이다.
  //
  // ⚠️ 조회가 실패해도 **리다이렉트를 포기하고 화면을 그린다.** plots 테이블이
  //    아직 없거나(마이그레이션 미적용) DB 가 잠깐 흔들릴 때, 홈 화면이 통째로
  //    500 이 되는 것보다 낫다. 증상을 숨기는 것이 아니라 더 나쁜 결과를 피하는
  //    것이므로 원인을 로그에 남긴다.
  // 화면이 함께 쓰므로 블록 밖에 둔다. 조회가 실패하면 빈 배열 그대로 그려서
  // 홈이 통째로 죽지 않게 한다(아래 catch 와 같은 이유).
  let plots: Awaited<ReturnType<typeof listPlotCards>> = [];

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

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-7 px-6 py-6 sm:py-8">
      {/* ── 최상단 고정 알림 ─────────────────────────
          특보만 여기 둔다. 생육 편차(중 우선순위)까지 위에 쌓으면 화면 맨 위를
          두 덩어리가 먹어, 정작 봐야 할 할 일이 접힌 곳 아래로 밀린다.
          편차는 텃밭 생육 얘기라 아래 텃밭 섹션이 제자리다. */}
      <HazardBanner alert={SAMPLE_ALERT} />

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
        <PlotStrip plots={plots} />
        <div className="mt-3">
          <DeviationBanner deviationKo={SAMPLE_DEVIATION} />
        </div>
      </section>

      {/* ── 할 일 + 주말 예보 ──────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:gap-8">
        <section aria-labelledby="tasks-heading">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="font-semibold text-fg text-sm" id="tasks-heading">
              주말 할 일
            </h2>
            <p className="font-mono text-[0.68rem] text-fg-subtle">
              금요일 06시 생성 · 우선순위순
            </p>
          </div>
          <TaskBoard tasks={SAMPLE_TASKS} />
        </section>

        <section aria-labelledby="forecast-heading">
          <h2
            className="mb-3 font-semibold text-fg text-sm"
            id="forecast-heading"
          >
            주말 날씨
          </h2>
          <WeekendForecast days={SAMPLE_WEEKEND} />

          <p className="mt-3 rounded-md bg-surface-2 px-3.5 py-3 text-fg-muted text-xs leading-relaxed">
            토·일 예보는 밭 좌표 기준입니다. 야외 작업을 언제 할지 정하는 데
            쓰세요.
          </p>
        </section>
      </div>

      <div className="border-border border-t pt-6">
        <SignOutButton size="sm" variant="ghost" />
      </div>
    </main>
  );
}
