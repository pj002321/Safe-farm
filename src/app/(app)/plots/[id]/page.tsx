import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CultivationList } from "@/components/plot/CultivationList";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { listCultivationCards } from "@/features/cultivations/cultivationStore";
import { loadPlotGrowth } from "@/features/cultivations/growthStore";
import { getPlotDetail } from "@/features/plots/plotStore";
import { getCurrentProfile } from "@/shared/auth/profileStore";
import { kstDateString } from "@/shared/utils/kstDate";
import { harvestCultivation, removeCultivation } from "./actions";

/**
 * ---------------------------------------------
 * [Feature]: 텃밭 상세  →  /plots/[id]
 *
 * [Description]
 * - 지도 마커 요약 카드의 "상세 보기" 가 닿는 곳. 밭 정보 한 줄과 **심은 작물
 *   카드 목록**으로 이뤄진다. 카드마다 누적 적산온도 게이지가 붙는다.
 * - 생육 단계는 **날짜가 아니라 GDD** 로 판정한다. 같은 20일이라도 더웠으면 더
 *   자라기 때문이다. 판정 규칙은 `ai-service` 의 `_growth_stage_lines` 와 같다 —
 *   화면과 LLM 이 다른 단계를 말하면 둘 중 하나는 거짓말이 된다.
 * - 오늘 날짜를 서버에서 한 번 정해 내려보낸다(`kstDateString()`). 컴포넌트가
 *   각자 `new Date()` 를 읽으면 서버와 브라우저가 다른 D+n 을 그린다.
 * - 조회는 두 번이다: 밭 자체(`getPlot`)와 재배 카드(`listCultivationCards`).
 *   밭부터 확인해야 남의 밭 id 에 대해 빈 목록이 아니라 404 가 나간다.
 * ---------------------------------------------
 */

export const metadata: Metadata = { title: "텃밭 상세" };

/** 지역과 넓이 한 줄. 넓이 환산은 `PlotManageList` 와 같다. */
function subtitleKo(regionKo: string, areaM2: number | null): string {
  if (areaM2 === null) return regionKo;
  const pyeong = Math.round(areaM2 / 3.305785);
  return `${regionKo} · ${Math.round(areaM2).toLocaleString("ko-KR")}㎡ (약 ${pyeong.toLocaleString("ko-KR")}평)`;
}

export default async function Page({
  params,
  searchParams,
}: PageProps<"/plots/[id]">) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  const plot = profile ? await getPlotDetail(profile.id, id) : null;
  if (!plot) notFound();

  const cards = await listCultivationCards(plot.id);
  const today = kstDateString();
  const growth = await loadPlotGrowth(plot, cards, today);

  const { error, saved } = await searchParams;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-6 sm:py-8">
      <SectionHeading
        description={subtitleKo(plot.regionKo, plot.areaM2)}
        title={plot.nameKo ?? "이름 없는 밭"}
      />

      {typeof error === "string" && (
        <p
          className="rounded-lg border border-unsuitable/25 bg-unsuitable/5 px-4 py-3 text-sm text-unsuitable"
          role="alert"
        >
          {error}
        </p>
      )}

      {saved === "harvested" && (
        <p className="rounded-lg border border-good/25 bg-good/5 px-4 py-3 text-good text-sm">
          수확 완료로 기록했습니다.
        </p>
      )}

      {saved === "deleted" && (
        <p className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-fg-muted text-sm">
          재배 기록을 지웠습니다.
        </p>
      )}

      <CultivationList
        cards={cards}
        growth={growth}
        onDelete={removeCultivation}
        onHarvest={harvestCultivation}
        plotId={plot.id}
        today={today}
      />
    </main>
  );
}
