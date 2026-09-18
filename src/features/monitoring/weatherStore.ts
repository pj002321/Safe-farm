import "server-only";

import { nearestStation } from "@/shared/geo/nearestStation";
import { listStations } from "@/shared/geo/stationStore";
import type { DailyTemp } from "@/shared/growth/gdd";
import { getSupabaseServer } from "@/shared/supabase/server";
import {
  buildWeatherSeries,
  type WeatherRow,
  type WeatherSeries,
} from "./domain/weatherSeries";

/**
 * ---------------------------------------------
 * [Feature]: 밭 주변 기상 계열 조회 (서버 전용)
 *
 * [Description]
 * - 관측은 관측소(`stations` → `weather_obs_daily`), 예보는 격자
 *   (`grids` → `weather_forecast`) 에서 온다. 축이 달라 한 표에 못 합치고,
 *   날짜로 맞추는 일은 `domain/weatherSeries.ts` 가 한다.
 * - 밭에서 격자를 찾을 때는 `plots.grid_x/grid_y` 로 `grids.nx/ny` 를 본다.
 *   좌표로 다시 계산하지 않는다 — 기상청 격자 변환은 밭을 넣을 때 이미 했다.
 * - 이 세 표는 ai-service 가 적재하는 **공용 참조 데이터**라 `user_id` 가 없고
 *   RLS 도 없다. 밭 소유 확인은 호출 전에 `getPlot()` 이 한다.
 * - ⚠️ `numeric` 은 supabase-js 가 **문자열로** 준다. 경계인 여기서 숫자로
 *   바꾼다.
 * - ⚠️ **예보 적재 코드가 아직 없다.** `weather_forecast` 는 대개 비어 있고,
 *   그 상태가 정상이다. 화면은 계열이 비는 경우를 그릴 수 있어야 한다.
 * ---------------------------------------------
 */

function num(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const DAY_MS = 86_400_000;

function shiftDate(date: string, days: number): string {
  const stamp = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(stamp)) return date;
  return new Date(stamp + days * DAY_MS).toISOString().slice(0, 10);
}

/** 밭이 속한 격자. 격자표에 없으면 null — 예보 없이 관측만 그린다. */
async function findGridId(plot: {
  gridX: number;
  gridY: number;
}): Promise<number | null> {
  const supabase = await getSupabaseServer();

  const { data, error } = await supabase
    .from("grids")
    .select("grid_id")
    .eq("nx", plot.gridX)
    .eq("ny", plot.gridY)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.grid_id ?? null;
}

async function listObservations(
  stationCode: string,
  fromDate: string,
  toDate: string,
): Promise<WeatherRow[]> {
  const supabase = await getSupabaseServer();

  const { data, error } = await supabase
    .from("weather_obs_daily")
    .select("obs_date, temp_max, temp_min, rainfall_mm")
    .eq("station_code", stationCode)
    .gte("obs_date", fromDate)
    .lte("obs_date", toDate)
    .order("obs_date", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    date: row.obs_date,
    tempMaxC: num(row.temp_max),
    tempMinC: num(row.temp_min),
    rainfallMm: num(row.rainfall_mm),
  }));
}

async function listForecast(
  gridId: number,
  fromDate: string,
  toDate: string,
): Promise<WeatherRow[]> {
  const supabase = await getSupabaseServer();

  const { data, error } = await supabase
    .from("weather_forecast")
    .select("fcst_date, temp_max, temp_min, rainfall_mm")
    .eq("grid_id", gridId)
    .gte("fcst_date", fromDate)
    .lte("fcst_date", toDate)
    .order("fcst_date", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    date: row.fcst_date,
    tempMaxC: num(row.temp_max),
    tempMinC: num(row.temp_min),
    rainfallMm: num(row.rainfall_mm),
  }));
}

export interface WeatherPlot {
  latitude: number;
  longitude: number;
  gridX: number;
  gridY: number;
}

/**
 * 내일부터 `days` 일치 예보 기온. 도달 예측(`shared/growth/forecast.ts`)이 쓴다.
 *
 * `loadWeatherSeries` 와 따로 두는 이유는 보는 기간이 다르기 때문이다. 차트는
 * 오늘 앞뒤 일주일이면 되지만 도달 예측은 **예보가 닿는 끝까지** 필요하다 —
 * 그만큼 평년값 외삽 구간이 줄고 답이 정확해진다.
 *
 * 기온이 없는 날은 뺀다. `DailyTemp` 는 둘 다 있어야 GDD 를 낼 수 있고, 여기서
 * 0 으로 채우면 그날치 적산이 조용히 사라진다.
 */
export async function loadForecastTemps(
  plot: Pick<WeatherPlot, "gridX" | "gridY">,
  today: string,
  days = 10,
): Promise<DailyTemp[]> {
  const gridId = await findGridId(plot);
  if (gridId === null) return [];

  const rows = await listForecast(
    gridId,
    shiftDate(today, 1),
    shiftDate(today, days),
  );

  return rows.flatMap((row) =>
    row.tempMaxC === null || row.tempMinC === null
      ? []
      : [{ date: row.date, tempMaxC: row.tempMaxC, tempMinC: row.tempMinC }],
  );
}

export interface PlotWeather {
  series: WeatherSeries;
  /** 이 밭 대신 읽은 관측소. 하나도 없으면 null — 관측 없이 예보만 그린다. */
  stationNameKo: string | null;
}

/**
 * 기준일 앞뒤로 `days` 일치 계열을 만든다.
 *
 * `today` 를 인자로 받는 이유는 `growthStore` 와 같다 — 여기서 `Date.now()` 를
 * 읽으면 같은 요청 안에서도 자정을 넘기며 값이 갈린다.
 */
export async function loadWeatherSeries(
  plot: WeatherPlot,
  today: string,
  days = 7,
  pastDays = 3,
): Promise<PlotWeather> {
  const from = shiftDate(today, -pastDays);
  const to = shiftDate(today, days - pastDays - 1);

  const [station, gridId] = await Promise.all([
    listStations().then((stations) => nearestStation(plot, stations)),
    findGridId(plot),
  ]);

  const [observations, forecast] = await Promise.all([
    station === null
      ? Promise.resolve<WeatherRow[]>([])
      : listObservations(station.stationCode, from, to),
    gridId === null
      ? Promise.resolve<WeatherRow[]>([])
      : listForecast(gridId, from, to),
  ]);

  return {
    series: buildWeatherSeries({
      today,
      days,
      pastDays,
      observations,
      forecast,
    }),
    stationNameKo: station?.nameKo ?? null,
  };
}
