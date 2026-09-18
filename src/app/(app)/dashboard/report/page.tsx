import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  FarmSummaryFallback,
  FarmSummaryPanel,
} from "@/components/dashboard/FarmSummaryPanel";
import { PlotSelect } from "@/components/dashboard/PlotSelect";
import {
  ReportFallback,
  ReportPanel,
} from "@/components/dashboard/ReportPanel";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { selectPlot } from "@/features/plots/domain/plotSelection";
import { listPlots } from "@/features/plots/plotStore";
import { getCurrentProfile } from "@/shared/auth/profileStore";

/**
 * ---------------------------------------------
 * [Feature]: 밭별 AI 생육 리포트  →  /dashboard/report
 *
 * [Description]
 * - 밭을 고르면 그 밭 하나의 리포트만 부른다 — `ForecastPanel`과 같은 이유다.
 *   전부 미리 불러 두면 ai-service 커넥션 풀을 밭 개수만큼 채운다.
 * - 숫자(GDD·강수·예보)는 매번 그 시점 값으로 새로 계산한다. LLM 요약(밭별·
 *   전체)은 하루 한 번만 만들고 ai-service 가 캐시한다 — 토큰을 아끼기 위해서다.
 * ---------------------------------------------
 */

export const metadata: Metadata = { title: "AI 생육 리포트" };

export default async function ReportPage({
  searchParams,
}: PageProps<"/dashboard/report">) {
  const profile = await getCurrentProfile();
  const params = await searchParams;
  const requestedPlotId = Array.isArray(params.plot)
    ? params.plot[0]
    : params.plot;

  let plots: Awaited<ReturnType<typeof listPlots>> = [];
  if (profile) {
    try {
      plots = await listPlots(profile.id);
    } catch (error) {
      console.error("[report] 밭 목록 조회 실패", error);
    }
  }

  const selected = selectPlot(plots, requestedPlotId);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-6 sm:py-8">
      <div>
        <SectionHeading
          description="고른 밭의 생육단계·강수·예보를 근거로 지금 상태를 요약합니다."
          eyebrow="report"
          title="AI 생육 리포트"
        />
        <Link
          className="mt-3 inline-block text-fg-muted text-xs underline underline-offset-2 hover:text-fg"
          href="/dashboard"
        >
          ← 홈으로
        </Link>
      </div>

      {!profile || !selected ? (
        <p className="rounded-lg border border-border border-dashed bg-surface-2/40 px-6 py-8 text-center text-fg-muted text-sm">
          등록된 밭이 없습니다.
        </p>
      ) : (
        <>
          <Suspense fallback={<FarmSummaryFallback />}>
            <FarmSummaryPanel userId={profile.id} />
          </Suspense>

          <PlotSelect
            basePath="/dashboard/report"
            plots={plots}
            selectedId={selected.id}
          />

          <Suspense fallback={<ReportFallback />} key={selected.id}>
            <ReportPanel
              plotId={selected.id}
              plotNameKo={selected.nameKo}
              userId={profile.id}
            />
          </Suspense>
        </>
      )}
    </main>
  );
}
