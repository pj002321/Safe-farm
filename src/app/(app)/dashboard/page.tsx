import type { Metadata } from "next";
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

/**
 * ---------------------------------------------
 * [Feature]: 앱 홈(대시보드)  →  /dashboard
 *
 * [Description]
 * - **텃밭 줄만 진짜 조회다.** 특보·할 일·주말 예보·신선도는 아직
 *   `components/dashboard/sample.ts` 의 고정 데이터이고, 조회가 붙는 대로
 *   하나씩 걷어낸다.
 * - 생육 단계는 여기서 낸다. `features/plots` 가 `features/growth` 를 import 할
 *   수 없어서(features 끼리 금지) app 계층인 이 파일이 둘을 잇는다.
 * - 화면 순서가 곧 급한 순서다: **특보 → 내 밭 → 오늘 할 일 → 주말 날씨**.
 *   특보를 아래에 두면 스크롤하지 않은 사람이 못 본다.
 * - 할 일이 주인공이라 반반이 아니다. 오른쪽 예보는 "토·일에 나갈 수 있나"를
 *   판단하는 보조 정보다.
 * - 밭이 없으면 `PlotStrip` 이 **온보딩 유도**로 바뀐다. 이 서비스는 밭이 있어야
 *   아무것도 할 수 없으므로 빈 상태는 안내가 아니라 다음 행동 하나여야 한다.
 * - `"use client"` 가 없다. 완료 체크·더보기까지 CSS 로 처리해서 이 화면의
 *   상호작용은 JS 없이 동작한다.
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

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  const plots = profile ? await listPlotCards(profile.id) : [];

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

        <ButtonLink
          href={PLOT_ONBOARDING_PATH}
          icon={<MapPinIcon />}
          variant="primary"
        >
          텃밭 등록
        </ButtonLink>
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
