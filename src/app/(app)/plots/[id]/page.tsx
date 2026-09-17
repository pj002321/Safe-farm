import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarIcon } from "@/components/icons";
import { CropCards, SowingStatusOption } from "@/components/plot/CropCards";
import { Button } from "@/components/shared/Button";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { listCropOptions } from "@/features/crops/cropStore";
import {
  findCalendarByNameKo,
  stageAt,
} from "@/features/growth/domain/growthStage";
import { daysSincePlanting } from "@/features/plots/domain/plotSummary";
import { getPlot } from "@/features/plots/plotStore";
import { getCurrentProfile } from "@/shared/auth/profileStore";
import {
  addCultivations,
  editCultivationSowing,
  harvestCultivation,
} from "./actions";

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
 * - **작물 추가는 밭을 새로 만들지 않고도 된다.** 이미 심어 둔 작물이 있는
 *   상태에서 다른 작물을 더 심을 수 있어야 해서(등록 때 다 고르라고 강요하지
 *   않는다), 등록 마법사와 같은 `CropCards`·`parseCultivationSelections` 를
 *   재사용한 `addCultivations` 를 붙였다.
 * - **파종일도 여기서 고친다.** 등록·작물 추가 때는 한 번만 받고 고칠 길이
 *   없었다 — GDD 적산 기준점이라 잘못 적으면 생육 단계가 계속 틀어진다.
 *   `SowingStatusOption`(`CropCards.tsx`)을 그대로 가져다 쓴다 — 재배가
 *   하나뿐이라 필드 이름에 cropId 를 매달지 않는다.
 * ---------------------------------------------
 */

export const metadata: Metadata = { title: "텃밭 상세" };

export default async function Page({ params }: PageProps<"/plots/[id]">) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  const plot = profile ? await getPlot(profile.id, id) : null;
  if (!plot) notFound();

  const now = new Date();
  const crops = await listCropOptions();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-6 sm:py-8">
      <SectionHeading
        description={
          plot.cultivations.length > 0
            ? `${plot.cultivations.length}가지 작물 재배 중`
            : "재배 중인 작물이 없습니다"
        }
        title={plot.nameKo ?? "이름 없는 밭"}
      />

      {plot.cultivations.map((cultivation) => {
        const calendar = findCalendarByNameKo(cultivation.cropNameKo);
        const days = daysSincePlanting(
          { sowingDate: cultivation.sowingDate },
          now,
        );
        const stage =
          calendar && days !== null ? stageAt(calendar, days) : null;

        return (
          <div
            className="rounded-lg border border-border bg-surface px-4 py-3"
            key={cultivation.id}
          >
            <div className="flex items-center justify-between">
              <p className="font-medium text-fg text-sm">
                {cultivation.cropNameKo ?? "작물 미지정"}
              </p>
              {cultivation.status === "GROWING" && (
                <form action={harvestCultivation}>
                  <input name="plotId" type="hidden" value={plot.id} />
                  <input
                    name="cultivationId"
                    type="hidden"
                    value={cultivation.id}
                  />
                  <Button size="sm" type="submit">
                    수확 완료
                  </Button>
                </form>
              )}
            </div>
            {stage ? (
              <div className="mt-2">
                <p className="font-medium text-accent text-sm">
                  {stage.nameKo}
                </p>
                <p className="mt-1 text-fg-muted text-sm">{stage.adviceKo}</p>
              </div>
            ) : (
              <p className="mt-2 text-fg-muted text-sm">
                생육 단계 정보가 아직 없습니다.
              </p>
            )}

            {/* 수확·실패 처리된 건은 되돌릴 일이 아니라 수정 칸을 안 보여준다. */}
            {(cultivation.status === "GROWING" ||
              cultivation.status === "PLANNED") && (
              <details className="mt-2 [&_summary]:list-none">
                <summary className="inline-flex w-fit cursor-pointer items-center gap-1 text-fg-subtle text-xs transition-colors hover:text-accent">
                  <CalendarIcon className="size-3.5" />
                  파종일 수정
                </summary>
                <form
                  action={editCultivationSowing}
                  className="group/sowing mt-2 flex flex-col gap-3 rounded-md bg-surface-2 p-3"
                >
                  <input name="plotId" type="hidden" value={plot.id} />
                  <input
                    name="cultivationId"
                    type="hidden"
                    value={cultivation.id}
                  />
                  <fieldset className="flex flex-col gap-1.5">
                    <legend className="font-medium text-fg text-xs">
                      파종일
                    </legend>
                    <SowingStatusOption
                      defaultChecked={cultivation.sowingDate !== null}
                      labelKo="날짜를 압니다"
                      name="sowingStatus"
                      value="known"
                    />
                    <SowingStatusOption
                      defaultChecked={cultivation.sowingDate === null}
                      labelKo="아직 안 심었어요"
                      name="sowingStatus"
                      value="unknown"
                    />
                  </fieldset>

                  {/* "날짜를 압니다"를 골랐을 때만 나타난다(CropSowingFields 와 같은 패턴). */}
                  <div className="hidden flex-col gap-1.5 group-has-[input[value=known]:checked]/sowing:flex">
                    <label
                      className="font-medium text-fg text-xs"
                      htmlFor={`sowing-date-${cultivation.id}`}
                    >
                      날짜 선택
                    </label>
                    <input
                      className="w-full rounded-md border border-border bg-surface px-3 py-2 text-fg text-sm transition-colors hover:border-accent focus:border-accent"
                      defaultValue={cultivation.sowingDate ?? ""}
                      id={`sowing-date-${cultivation.id}`}
                      name="sowingDate"
                      type="date"
                    />
                  </div>

                  <div>
                    <Button size="sm" type="submit">
                      저장
                    </Button>
                  </div>
                </form>
              </details>
            )}
          </div>
        );
      })}

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
