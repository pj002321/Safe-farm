import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CropCards } from "@/components/plot/CropCards";
import { CultivationList } from "@/components/plot/CultivationList";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { SubmitButton } from "@/components/shared/SubmitButton";
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
  // 이 화면의 목적은 "지금 뭘 해야 하나" 다. 끝난 재배는 접기 속으로 **내린다** —
  // 지우지 않는다. 밭에서 없애면 "작년에 여기 뭘 심었더라"(연작 판단)를 볼 자리가
  // 사라진다.
  //
  // ⚠️ **조회가 아니라 여기서 거른다.** `listCultivationCards` 는 랜딩의
  //    `TodayInSangju` 도 쓴다. 저장소는 "이 밭의 재배 전부" 라는 뜻을 지키고,
  //    무엇을 보일지는 화면이 정한다.
  const 기르는중 = cards.filter(
    (card) => card.status === "GROWING" || card.status === "PLANNED",
  );
  const 끝난것 = cards.filter(
    (card) => card.status === "HARVESTED" || card.status === "FAILED",
  );
  const today = kstDateString();
  const growth = await loadPlotGrowth(plot, cards, today);

  const { error, saved } = await searchParams;
  const crops = await listCropOptions();

  // 목록을 두 번 그린다 — 기르는 중, 그리고 접기 속의 지난 재배. 손잡이가 같아
  // `cards` 만 갈아 끼운다. 프롭 일곱을 두 벌로 적으면 한쪽만 고쳐진다
  // (아래 `addCropForm` 과 같은 이유).
  const 작물목록 = (list: typeof cards) => (
    <CultivationList
      cards={list}
      growth={growth}
      onDelete={removeCultivation}
      onEditSowing={editCultivationSowing}
      onHarvest={harvestCultivation}
      plotId={plot.id}
      today={today}
    />
  );

  // 접힌 채로도, 그대로도 쓰는 폼이라 한 번만 적는다. 두 벌로 두면 한쪽만
  // 고쳐져 빈 밭과 그렇지 않은 밭의 입력이 갈린다.
  const addCropForm = (
    <form
      action={addCultivations}
      className="mt-3 flex flex-col gap-4 rounded-lg bg-surface-2 p-4"
    >
      <input name="plotId" type="hidden" value={plot.id} />
      {/* 제출 버튼을 검색창 옆으로 올린다. 아래에 두면 작물 카드 79장(2026-09-18)을
          끝까지 스크롤해야 눌렀다 — 카드 수는 마스터가 늘면 같이 는다.
          `CropCards` 가 action 을 받으면 그 줄이 화면 위에 붙어 따라온다.
          연타하면 같은 작물이 그만큼 더 생긴다 — `SubmitButton` 참고. */}
      <CropCards
        action={
          <SubmitButton pendingKo="추가하는 중" size="sm">
            추가
          </SubmitButton>
        }
        crops={crops}
        maxSowingDate={today}
      />
    </form>
  );

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

      {작물목록(기르는중)}

      {/* 끝난 재배. `<details>` 라 **JS 가 0줄**이고, 재배 상세의 `지나온 기록` 이
          이미 쓰는 것과 같은 언어다.
          ⚠ `length > 0` 을 꼭 건다. 목록은 비면 "지금 기르는 작물이 없습니다" 안내를
            내는데, 접기 속에서 그 말이 나오면 말이 안 된다. */}
      {끝난것.length > 0 && (
        <details className="rounded-lg border border-border bg-surface-2/40 px-4 py-3">
          <summary className="cursor-pointer text-fg-muted text-sm">
            지난 재배 {끝난것.length}건 보기
          </summary>
          <div className="mt-4">{작물목록(끝난것)}</div>
        </details>
      )}

      {/* 어느 관측소를 읽었는지 밝힌다. 밭에서 먼 관측소가 잡히면 사용자가 그
          사실을 알아야 게이지를 얼마나 믿을지 판단할 수 있다.
          ⚠ 목록이 아니라 **밭**에 관한 사실이라 여기서 한 번만 찍는다 —
            `CultivationList` 안에 두었더니 접기까지 두 번 그려졌다(2026-09-22). */}
      {cards.length > 0 && growth.stationCode !== null && (
        <p className="font-mono text-fg-subtle text-xs">
          기온 출처: {growth.stationNameKo ?? growth.stationCode} 관측소
          {growth.latestObsDate !== null &&
            ` · 관측 ${growth.latestObsDate}까지`}
        </p>
      )}

      {/* 등록 화면과 같은 `CropCards`·`addCultivations` 조합이다 — 이미 심어 둔
          작물이 있어도 밭을 새로 만들지 않고 나중에 더할 수 있어야 한다. */}
      {/* **지금 기르는** 작물이 없으면 접는 버튼 없이 폼만 내놓는다. 빈 밭에서 할
          일은 하나뿐이라 화면에 보이는 것도 하나여야 한다 — 위의 안내(`CultivationList`)가
          버튼을 달지 않는 것도 같은 이유다. 반대로 작물이 있을 때 펴 두면 카드가
          아래로 밀리므로 그때는 접는다.
          ⚠️ `cards` 가 아니라 `기르는중` 으로 잰다(2026-09-22). 끝난 재배만 남은
          밭도 위 안내가 "아래에서 골라 주세요" 라고 하니, 폼이 접혀 있으면 안 된다. */}
      {기르는중.length === 0 ? (
        addCropForm
      ) : (
        <details className="[&_summary]:list-none">
          <summary className="inline-flex w-fit cursor-pointer items-center rounded-md px-3 py-1.5 font-medium text-fg-muted text-sm transition-colors duration-200 ease-out-expo hover:bg-surface-2 hover:text-fg">
            작물 추가
          </summary>
          {addCropForm}
        </details>
      )}
    </main>
  );
}
