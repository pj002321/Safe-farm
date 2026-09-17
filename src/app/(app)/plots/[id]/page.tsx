import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CropCards } from "@/components/plot/CropCards";
import { CultivationList } from "@/components/plot/CultivationList";
import { Button } from "@/components/shared/Button";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { listCropOptions } from "@/features/crops/cropStore";
import { listCultivationCards } from "@/features/cultivations/cultivationStore";
import { loadPlotGrowth } from "@/features/cultivations/growthStore";
import { getPlotDetail } from "@/features/plots/plotStore";
import { getCurrentProfile } from "@/shared/auth/profileStore";
import { kstDateString } from "@/shared/utils/kstDate";
import {
  addCultivations,
  editCultivationSowing,
  harvestCultivation,
  removeCultivation,
} from "./actions";

/**
 * ---------------------------------------------
 * [Feature]: 텃밭 상세  →  /plots/[id]
 *
 * [Description]
 * - 지도 마커 요약 카드의 "상세 보기" 가 닿는 곳. 밭 정보 한 줄과 **심은 작물
 *   카드 목록**으로 이뤄진다. 카드마다 누적 적산온도 게이지가 붙는다.
 * - **한 밭에 재배 건이 여러 개일 수 있다**(배추를 8월에, 무를 9월에 심는 식).
 *   그래서 대표 한 건이 아니라 재배 카드 전부를 건별로 그린다 —
 *   마커(`PlotMapPoint.cropNameKo`)처럼 대표만 보여주면 나머지가 화면에서 사라진다.
 * - 생육 단계는 **날짜가 아니라 GDD** 로 판정한다. 같은 20일이라도 더웠으면 더
 *   자라기 때문이다. 판정 규칙은 `ai-service` 의 `_growth_stage_lines` 와 같다 —
 *   화면과 LLM 이 다른 단계를 말하면 둘 중 하나는 거짓말이 된다.
 * - 오늘 날짜를 서버에서 한 번 정해 내려보낸다(`kstDateString()`). 컴포넌트가
 *   각자 `new Date()` 를 읽으면 서버와 브라우저가 다른 D+n 을 그린다.
 * - 조회는 두 번이다: 밭 자체(`getPlotDetail`)와 재배 카드(`listCultivationCards`).
 *   밭부터 확인해야 남의 밭 id 에 대해 빈 목록이 아니라 404 가 나간다.
 * - **작물 추가는 밭을 새로 만들지 않고도 된다.** 이미 심어 둔 작물이 있는
 *   상태에서 다른 작물을 더 심을 수 있어야 해서(등록 때 다 고르라고 강요하지
 *   않는다), 등록 마법사와 같은 `CropCards`·`parseCultivationSelections` 를
 *   재사용한 `addCultivations` 를 붙였다.
 * - **파종일 수정은 카드 안에 있다**(`CultivationList`). 재배 건마다 따로라
 *   카드를 그리는 쪽에 두는 편이 맞고, 여기서는 액션만 내려보낸다.
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
  const crops = await listCropOptions();

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
        onEditSowing={editCultivationSowing}
        onHarvest={harvestCultivation}
        plotId={plot.id}
        today={today}
      />

      {/* 등록 화면과 같은 `CropCards`·`addCultivations` 조합이다 — 이미 심어 둔
          작물이 있어도 밭을 새로 만들지 않고 나중에 더할 수 있어야 한다. */}
      <details className="[&_summary]:list-none">
        <summary className="inline-flex w-fit cursor-pointer items-center rounded-md px-3 py-1.5 font-medium text-fg-muted text-sm transition-colors duration-200 ease-out-expo hover:bg-surface-2 hover:text-fg">
          작물 추가
        </summary>
        <form
          action={addCultivations}
          className="mt-3 flex flex-col gap-4 rounded-lg bg-surface-2 p-4"
        >
          <input name="plotId" type="hidden" value={plot.id} />
          <CropCards crops={crops} />
          <div>
            <Button size="sm" type="submit">
              추가
            </Button>
          </div>
        </form>
      </details>
    </main>
  );
}
