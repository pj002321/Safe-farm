import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Button } from "@/components/shared/Button";
import { SectionHeading } from "@/components/shared/SectionHeading";
import {
  findCalendarByNameKo,
  stageAt,
} from "@/features/growth/domain/growthStage";
import { daysSincePlanting } from "@/features/plots/domain/plotSummary";
import { getPlot } from "@/features/plots/plotStore";
import { getCurrentProfile } from "@/shared/auth/profileStore";
import { harvestCultivation } from "./actions";

/**
 * ---------------------------------------------
 * [Feature]: 텃밭 상세  →  /plots/[id]
 *
 * [Description]
 * - 지도 마커 요약 카드의 "상세 보기" 가 닿는 곳. 최소 버전이라 작물·생육단계·
 *   다음 작업만 보여준다.
 * - **한 밭에 재배 건이 여러 개일 수 있다**(배추를 8월에, 무를 9월에 심는 식).
 *   그래서 대표 한 건이 아니라 `plot.cultivations` 전부를 건별로 카드로 그린다
 *   — 마커(`PlotMapPoint.cropNameKo`)처럼 대표만 보여주면 나머지 작물이 화면에서
 *   사라진다.
 * - `CROP_CALENDARS` 에 없는 작물(단감처럼 파종일 기준 생육단계 모델이 안 맞는
 *   과수 등)은 생육단계 없이 이름만 보여준다.
 * - 작물 이름은 `cultivations` 를 타고 온 작물 마스터의 이름이다. 화면에 박아 둔
 *   목록에서 찾지 않는다 — 그 목록의 슬러그는 마스터와 이어지지 않았다.
 * ---------------------------------------------
 */

export const metadata: Metadata = { title: "텃밭 상세" };

export default async function Page({ params }: PageProps<"/plots/[id]">) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  const plot = profile ? await getPlot(profile.id, id) : null;
  if (!plot) notFound();

  const calendar = findCalendarByNameKo(plot.cropNameKo);
  const days = daysSincePlanting(plot, new Date());
  const stage = calendar && days !== null ? stageAt(calendar, days) : null;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-6 sm:py-8">
      <SectionHeading
        description={plot.cropNameKo ?? "작물 미정"}
        title={plot.nameKo ?? "이름 없는 밭"}
      />
      {stage ? (
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <p className="font-medium text-accent text-sm">{stage.nameKo}</p>
          <p className="mt-1 text-fg-muted text-sm">{stage.adviceKo}</p>
        </div>
      ) : (
        <p className="text-fg-muted text-sm">생육 단계 정보가 아직 없습니다.</p>
      )}

      {/* 기르는 중인 재배 건만 수확 처리 대상이다. */}
      {plot.cultivations
        .filter((cultivation) => cultivation.status === "GROWING")
        .map((cultivation) => (
          <form
            action={harvestCultivation}
            className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3"
            key={cultivation.id}
          >
            <input name="plotId" type="hidden" value={plot.id} />
            <input name="cultivationId" type="hidden" value={cultivation.id} />
            <p className="text-fg text-sm">
              {cultivation.cropNameKo ?? "작물 미지정"}
            </p>
            <Button size="sm" type="submit">
              수확 완료
            </Button>
          </form>
        ))}
    </main>
  );
}
