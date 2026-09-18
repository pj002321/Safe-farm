import "server-only";

import { nearestStation } from "@/shared/geo/nearestStation";
import { listStations } from "@/shared/geo/stationStore";
import type { MonthlyNormal } from "@/shared/growth/forecast";
import type { DailyTemp } from "@/shared/growth/gdd";
import { type NormalRow, toMonthlyNormals } from "@/shared/growth/normals";
import { getSupabaseServer } from "@/shared/supabase/server";
import type { CultivationCard } from "./domain/cultivationCard";
import {
  buildGrowthGauge,
  type GrowthGauge,
  type StageRow,
} from "./domain/growthGauge";

/**
 * ---------------------------------------------
 * [Feature]: 재배별 누적 GDD 조회 (서버 전용)
 *
 * [Description]
 * - 게이지에 필요한 세 가지를 모아 `buildGrowthGauge()` 에 넣는다: 밭에서 가장
 *   가까운 관측소, 그 관측소의 일통계, 품종별 단계표.
 * - **한 밭의 재배 전부를 한 번에 처리한다.** 카드마다 따로 조회하면 같은 관측을
 *   여러 번 읽는다. 관측소는 밭당 하나라 어차피 같은 구간이다.
 * - `stations` · `weather_obs_daily` · `crop_stages` 는 ai-service 가 적재하는
 *   **공용 참조 데이터**라 `user_id` 가 없다. 사용자별로 갈리는 값이 아니므로
 *   RLS 도 걸려 있지 않다 — 밭의 소유 확인은 호출 전에 `getPlot()` 이 한다.
 * - ⚠️ `numeric` 컬럼은 supabase-js 가 **문자열로** 준다. 경계인 여기서 숫자로
 *   바꾼다. 문자열인 채로 더하면 `"29.3" + "30.1"` 이 되어 값이 이어 붙는다.
 * ---------------------------------------------
 */

export interface CultivationGrowth {
  cultivationId: string;
  /** 적산을 시작할 지점이 없거나 단계표·목표 GDD 가 없으면 null. */
  gauge: GrowthGauge | null;
}

export interface PlotGrowth {
  /** 이 밭 대신 읽은 관측소. 관측소가 하나도 없으면 null. */
  stationCode: string | null;
  stationNameKo: string | null;
  /** 관측이 들어와 있는 마지막 날. 오늘보다 이르면 게이지가 그만큼 뒤처져 있다. */
  latestObsDate: string | null;
  growths: CultivationGrowth[];
}

/** 빈 결과. 심은 것이 없거나 관측소를 못 고른 밭이 받는다. */
const EMPTY: PlotGrowth = {
  stationCode: null,
  stationNameKo: null,
  latestObsDate: null,
  growths: [],
};

function num(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * 한 관측소의 일통계. `fromDate` 이후만.
 *
 * 최고·최저 중 하나라도 없는 날은 뺀다. 0 으로 채우면 그날치 GDD 가 엉뚱하게
 * 계산되는데, 아예 없는 것으로 두면 `coveredDays` 가 줄어 화면이 "관측 누락"을
 * 말할 수 있다.
 */
export async function listObservations(
  stationCode: string,
  fromDate: string,
): Promise<DailyTemp[]> {
  const supabase = await getSupabaseServer();

  const { data, error } = await supabase
    .from("weather_obs_daily")
    .select("obs_date, temp_max, temp_min")
    .eq("station_code", stationCode)
    .gte("obs_date", fromDate)
    .order("obs_date", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).flatMap((row) => {
    const max = num(row.temp_max);
    const min = num(row.temp_min);
    if (max === null || min === null) return [];
    return [{ date: row.obs_date, tempMaxC: max, tempMinC: min }];
  });
}

/**
 * 관측소 하나의 월별 평년 기온. `forecastArrival_2` 가 예보 밖을 메우는 재료다.
 *
 * `normals` 는 관측소 × (월, 일) 일별 표라 366행이 온다 — 달로 접는 것은 순수 함수
 * (`toMonthlyNormals`)가 한다. 이 함수는 읽기만.
 *
 * ⚠️ 평년값이 없는 관측소가 있다(공항·신설). 2026-09-18 기준 밭 관측소 109곳 중 24곳.
 *   그때는 빈 배열이고, 호출자(`detailStore`)가 `_1`(최근 평균)로 내려간다.
 *   지도 쪽은 닮은 관측소에서 빌리는데(`normal_fallback.csv` → sigungu_station.normal_station)
 *   밭 쪽 `stations` 표에는 아직 그 짝 칸이 없다 — 교안_파종시기_두벌.md '딴 줄기'.
 */
export async function listMonthlyNormals(
  stationCode: string,
): Promise<MonthlyNormal[]> {
  const supabase = await getSupabaseServer();

  const { data, error } = await supabase
    .from("normals")
    .select("source, month, tmax_normal, tmin_normal")
    .eq("station", stationCode);

  if (error) throw new Error(error.message);

  const rows: NormalRow[] = (data ?? []).map((row) => ({
    source: row.source,
    month: Number(row.month),
    tempMaxC: num(row.tmax_normal),
    tempMinC: num(row.tmin_normal),
  }));
  return toMonthlyNormals(rows);
}

/** 품종별 단계표. 여러 품종을 한 번에 읽고 호출자가 나눠 쓴다. */
export async function listStages(
  variantIds: readonly number[],
): Promise<Map<number, StageRow[]>> {
  const grouped = new Map<number, StageRow[]>();
  if (variantIds.length === 0) return grouped;

  const supabase = await getSupabaseServer();

  const { data, error } = await supabase
    .from("crop_stages")
    .select("variant_id, stage_order, stage_name, gdd_from, gdd_to, guide_text")
    .in("variant_id", [...new Set(variantIds)])
    .order("stage_order", { ascending: true });

  if (error) throw new Error(error.message);

  for (const row of data ?? []) {
    const stage: StageRow = {
      stageOrder: row.stage_order,
      stageNameKo: row.stage_name,
      gddFrom: row.gdd_from,
      gddTo: row.gdd_to,
      guideKo: row.guide_text,
    };
    const bucket = grouped.get(row.variant_id);
    if (bucket) bucket.push(stage);
    else grouped.set(row.variant_id, [stage]);
  }

  return grouped;
}

/**
 * 관측을 언제부터 읽을지.
 *
 * 카드 중 가장 이른 파종일이다. 카드마다 따로 읽지 않으려고 제일 넓은 구간을
 * 한 번에 가져온다. 파종일을 아는 카드가 하나도 없으면 null — 읽을 구간이 없다.
 */
function earliestSowingDate(cards: readonly CultivationCard[]): string | null {
  const dates = cards
    .map((card) => card.sowingDate)
    .filter((date): date is string => date !== null);
  if (dates.length === 0) return null;
  return dates.reduce((min, date) => (date < min ? date : min));
}

/**
 * 밭 하나의 재배 카드 전부에 게이지를 붙인다.
 *
 * `today` 를 인자로 받는다 — 여기서 `Date.now()` 를 읽으면 같은 요청 안에서도
 * 자정을 넘기며 값이 갈리고, 테스트에서 고정할 수가 없다.
 */
export async function loadPlotGrowth(
  plot: { latitude: number; longitude: number },
  cards: readonly CultivationCard[],
  today: string,
): Promise<PlotGrowth> {
  if (cards.length === 0) return EMPTY;

  const station = nearestStation(plot, await listStations());
  if (station === null) return EMPTY;

  const from = earliestSowingDate(cards);
  const observations =
    from === null ? [] : await listObservations(station.stationCode, from);
  const stagesByVariant = await listStages(cards.map((card) => card.variantId));

  const growths = cards.map((card) => {
    const stages = stagesByVariant.get(card.variantId) ?? [];
    // 목표 GDD 나 기준온도가 없으면 게이지를 그릴 수 없다. 단계표가 비어도
    // 누적은 낼 수 있지만 "지금 어느 단계"를 말할 수 없어 같이 막는다.
    if (card.gddTarget === null || card.baseTempC === null || !stages.length) {
      return { cultivationId: card.id, gauge: null };
    }
    return {
      cultivationId: card.id,
      gauge: buildGrowthGauge({
        sowingDate: card.sowingDate,
        startStageOrder: card.startStageOrder,
        baseTempC: card.baseTempC,
        upperTempC: card.upperTempC,
        gddTarget: card.gddTarget,
        stages,
        observations,
        today,
      }),
    };
  });

  return {
    stationCode: station.stationCode,
    stationNameKo: station.nameKo,
    latestObsDate: observations.at(-1)?.date ?? null,
    growths,
  };
}
