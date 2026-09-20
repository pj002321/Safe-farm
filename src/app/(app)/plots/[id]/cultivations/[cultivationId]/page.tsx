import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DiaryExportButton } from "@/components/cultivation/DiaryExportButton";
import { EndCultivationForm } from "@/components/cultivation/EndCultivationForm";
import { HarvestSummaryCard } from "@/components/cultivation/HarvestSummaryCard";
import { ObservationForm } from "@/components/cultivation/ObservationForm";
import { RecordTimeline } from "@/components/cultivation/RecordTimeline";
import { StageAddForm } from "@/components/cultivation/StageAddForm";
import { StageOverrideForm } from "@/components/cultivation/StageOverrideForm";
import { StageTimeline } from "@/components/cultivation/StageTimeline";
import { TaskAdviceList } from "@/components/cultivation/TaskAdviceList";
import { Card } from "@/components/shared/Card";
import { GrowthGauge } from "@/components/shared/GrowthGauge";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { loadCultivationDetail } from "@/features/cultivations/detailStore";
import { cardTitle } from "@/features/cultivations/domain/cultivationCard";
import { pickedFromQuery } from "@/features/cultivations/domain/pickedTasks";
import { loadForecastTemps } from "@/features/monitoring/weatherStore";
import { getPlotDetail } from "@/features/plots/plotStore";
import { getCurrentProfile } from "@/shared/auth/profileStore";
import { kstDateString } from "@/shared/utils/kstDate";
import { harvestCultivation } from "../../actions";
import {
  addObservation,
  addStage,
  failCultivation,
  overrideStage,
  removeEvent,
} from "./actions";

/**
 * ---------------------------------------------
 * [Feature]: 재배 상세  →  /plots/[id]/cultivations/[cultivationId]
 *
 * [Description]
 * - 밭 상세의 작물 카드가 닿는 곳. 게이지 하나로는 "지금 뭘 해야 하나"를 못
 *   말해서, 단계 타임라인 · 할 일 · 도달 예측 · 기록을 한 화면에 모았다.
 * - 조회는 두 갈래다. 재배 쪽은 `loadCultivationDetail()` 이 한 번에 모으고,
 *   예보는 `features/monitoring` 이 따로 읽어 **여기서 합친다** — features
 *   끼리는 import 할 수 없다(AGENTS.md).
 * - 오늘 날짜를 서버에서 한 번 정해 내려보낸다(`kstDateString()`). 컴포넌트가
 *   각자 `new Date()` 를 읽으면 서버와 브라우저가 다른 날을 그린다.
 * - 수확은 밭 상세의 액션(`../../actions`)을 그대로 쓴다. 같은 일을 두 벌로
 *   두면 한쪽만 고쳐진다.
 * - `했음` 으로 담아 둔 카드는 **주소(`?picked=`)에 산다.** 화면이 상태를 들면
 *   Client Component 가 되는데, 이 화면은 JS 가 0줄인 것이 성질이다. 여기서
 *   한 번 읽어 할 일 목록과 관찰 기록에 같이 내린다 — 두 곳이 같은 목록을
 *   봐야 한쪽에서 사라진 카드가 다른 쪽에 나타난다.
 * ---------------------------------------------
 */

export const metadata: Metadata = { title: "재배 상세" };

export default async function Page({
  params,
  searchParams,
}: PageProps<"/plots/[id]/cultivations/[cultivationId]">) {
  const { id, cultivationId } = await params;

  const profile = await getCurrentProfile();
  // ⚠ `profile` 을 먼저 막는다. 아래에서 `profile.id` 를 쓰는데, `plot` 만 검사하면
  //   타입이 "plot 이 있으면 profile 도 있다" 를 모른다.
  if (!profile) notFound();
  const plot = await getPlotDetail(profile.id, id);
  if (!plot) notFound();

  const today = kstDateString();
  // 도달 예측용 예보. 관측 계열은 더 읽지 않는다 — 그걸 보던 것은 화면 쪽 할 일
  // 규칙 하나뿐이었고, 그 판정이 ai-service 로 넘어갔다.
  // ⚠ `userId` 를 같이 넘긴다. ai-service 가 밭을 먼저 찾아 격자 캐시 열쇠를
  //   만든다 — 안 넘기면 좌표 열쇠로 떨어져 밭마다 1.2초가 붙는다
  //   (`weatherStore.loadForecastTemps` 의 ★).
  const forecast = await loadForecastTemps(
    { ...plot, userId: profile.id },
    today,
  ).catch((error) => {
    // 예보가 없으면 평년값만으로 메운다. 예측 하나 때문에 화면을 죽이지 않는다.
    console.error("[cultivation] 예보 조회 실패", error);
    return [];
  });
  const detail = await loadCultivationDetail(
    plot,
    cultivationId,
    today,
    forecast,
  );
  if (!detail) notFound();

  const { card, gauge, summary } = detail;
  const ended = card.status === "HARVESTED" || card.status === "FAILED";
  const stageNames = Object.fromEntries(
    detail.stages.map((stage) => [stage.stageOrder, stage.stageNameKo]),
  );

  const { error, saved, picked: pickedRaw } = await searchParams;
  // 지금 뜨는 카드에 있는 제목만 통과시킨다. 주소를 손으로 고쳐도 안 들어온다.
  //
  // ⚠ 할 일을 **못 받은** 때(`failed`)는 `null` 을 넘겨 거르지 않는다. 목록이
  //   비었다고 담아 둔 카드를 버리면, ai-service 가 한 번 튕길 때 적던 메모까지
  //   날아간다 — "목록에 없다" 와 "목록을 모른다" 는 다르다.
  const picked = pickedFromQuery(
    pickedRaw,
    detail.taskReason === "failed" ? null : detail.tasks,
  );

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-6 sm:py-8">
      <SectionHeading
        description={`${plot.nameKo ?? plot.regionKo} · ${card.sowingDate ?? "파종일 미정"} 시작`}
        title={cardTitle(card)}
      />

      {typeof error === "string" && (
        <p
          className="rounded-lg border border-unsuitable/25 bg-unsuitable/5 px-4 py-3 text-sm text-unsuitable"
          role="alert"
        >
          {error}
        </p>
      )}

      {typeof saved === "string" && (
        <p className="rounded-lg border border-good/25 bg-good/5 px-4 py-3 text-good text-sm">
          기록했습니다.
        </p>
      )}

      {summary !== null && (
        <Card title="마친 재배">
          <HarvestSummaryCard
            failureReason={card.failureReason}
            summary={summary}
          />
        </Card>
      )}

      {gauge !== null && (
        <Card title="생육 진행">
          <div className="flex flex-col gap-4">
            <GrowthGauge
              dayLabelKo={`관측 ${gauge.coveredDays}일 / ${gauge.expectedDays}일`}
              footEndKo={`목표 ${gauge.targetGdd}℃·일`}
              footStartKo={detail.stationNameKo ?? "관측소 없음"}
              markLabelKo={gauge.stage?.stageNameKo ?? "수확기"}
              markRatio={gauge.markRatio}
              revealed
              target={gauge.targetGdd}
              value={gauge.accumulatedGdd}
            />

            {detail.nextStage !== null && (
              <p className="text-fg-muted text-sm">
                {detail.nextStage.forecast.arrivalDate === null
                  ? `다음 단계(${detail.nextStage.stageNameKo}) 도달일은 아직 내다볼 수 없습니다.`
                  : `다음 단계(${detail.nextStage.stageNameKo})까지 ${detail.nextStage.forecast.daysLeft}일 — ${detail.nextStage.forecast.arrivalDate} 예상${detail.nextStage.forecast.extrapolated ? " (추정)" : ""}`}
              </p>
            )}

            {detail.harvest !== null && detail.harvest.arrivalDate !== null && (
              <p className="text-fg-muted text-sm">
                수확 예상 {detail.harvest.arrivalDate}
                {detail.harvest.extrapolated ? " (추정)" : ""}
              </p>
            )}
          </div>
        </Card>
      )}

      <Card title="생육 단계">
        <div className="flex flex-col gap-4">
          <StageTimeline fruit={detail.fruit} steps={detail.stageSteps} />
          {!ended && (
            <StageOverrideForm
              cultivationId={card.id}
              currentStageOrder={gauge?.stage?.stageOrder ?? null}
              onSubmit={overrideStage}
              plotId={plot.id}
              stages={detail.stages}
              today={today}
            />
          )}
          {!ended && (
            <StageAddForm
              cultivationId={card.id}
              onSubmit={addStage}
              plotId={plot.id}
              today={today}
            />
          )}
        </div>
      </Card>

      {!ended && (
        <Card title="이번 주 할 일">
          <TaskAdviceList
            picked={picked}
            reason={detail.taskReason}
            tasks={detail.tasks}
          />
        </Card>
      )}

      {!ended && (
        <Card title="관찰 기록">
          <ObservationForm
            cultivationId={card.id}
            currentStageOrder={gauge?.stage?.stageOrder ?? null}
            onSubmit={addObservation}
            picked={picked}
            plotId={plot.id}
            today={today}
          />
        </Card>
      )}

      <Card title="지나온 기록">
        <div className="flex flex-col gap-4">
          <RecordTimeline
            cultivationId={card.id}
            entries={detail.entries}
            onRemove={removeEvent}
            plotId={plot.id}
            stageNames={stageNames}
          />
          <DiaryExportButton />
        </div>
      </Card>

      {!ended && (
        <Card title="재배 끝내기">
          <EndCultivationForm
            cultivationId={card.id}
            onFail={failCultivation}
            onHarvest={harvestCultivation}
            plotId={plot.id}
          />
        </Card>
      )}
    </main>
  );
}
