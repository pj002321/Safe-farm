import { accumulateGdd, type DailyTemp } from "@/shared/growth/gdd";

/**
 * ---------------------------------------------
 * [Feature]: 재배 종료 요약 — 총 일수·총 GDD·예측 오차 (순수)
 *
 * [Description]
 * - 수확하거나 중단한 재배 한 건을 되짚는 값이다. 목록에서는 "끝남" 한 줄이지만,
 *   다음 시즌에 쓸 자료는 **얼마나 걸렸고 얼마나 쌓였나** 쪽이다.
 * - 총 GDD 를 저장하지 않고 여기서 다시 합산한다. 기상 관측이 뒤늦게 정정되면
 *   저장해 둔 값은 원천과 어긋난다(cultivations 마이그레이션과 같은 방침).
 * - **예측 오차를 같이 낸다.** `cultivation_events` 의 `FORECAST` 행은 그때 우리가
 *   내놓은 수확일이고, `harvestedAt` 은 실제다. 둘의 차이가 쌓여야 예측이 나아
 *   지는지 알 수 있다 — 안 남기면 매번 처음부터 시작한다.
 * - 관측이 비는 날은 0 으로 더해지므로 총 GDD 가 실제보다 낮게 나올 수 있다.
 *   `coveredDays` 를 같이 돌려주어 화면이 그 사실을 적게 한다.
 *
 * [Usage]
 * ```ts
 * const summary = buildHarvestSummary({ ... });
 * summary?.totalDays;        // 63
 * summary?.forecastErrorDays; // -2 — 이틀 일찍 거뒀다
 * ```
 * ---------------------------------------------
 */

export interface HarvestSummaryInput {
  sowingDate: string | null;
  /** 수확일. 중단한 건이면 null 이고 `failedAt` 이 채워진다. */
  harvestedAt: string | null;
  failedAt: string | null;
  /** 적산 시작 GDD (모종이면 0 이 아니다). */
  startGdd: number;
  observations: readonly DailyTemp[];
  baseTempC: number;
  upperTempC: number | null;
  /**
   * 가장 **먼저** 내놓았던 수확 예측일. 없으면 null.
   *
   * 마지막 예측이 아니라 첫 예측을 쓴다. 수확 하루 전 예측은 거의 맞을 수밖에
   * 없어서 오차가 0 으로 수렴한다 — 그러면 재보정할 거리가 사라진다.
   */
  firstForecastOn: string | null;
}

export interface HarvestSummary {
  /** 끝난 날. 수확이면 수확일, 중단이면 중단일. */
  endedOn: string;
  ended: "HARVESTED" | "FAILED";
  /** 파종일부터 끝난 날까지. 파종일당일도 한 날로 센다. 파종일을 모르면 null. */
  totalDays: number | null;
  /** 그 기간에 쌓인 총 GDD. */
  totalGdd: number;
  /**
   * 그 기간에 관측이 실제로 있는 날 수. `totalDays` 보다 적으면 총 GDD 가
   * 실제보다 낮다는 뜻이다.
   */
  coveredDays: number;
  /**
   * 예측 오차(일). **음수 = 예측보다 일찍** 끝났다.
   * 첫 예측이 없거나 중단된 건이면 null — 중단은 예측 대상이 아니었다.
   */
  forecastErrorDays: number | null;
}

const DAY_MS = 86_400_000;

/** 달력 날짜 사이의 일수. UTC 자정 기준이라 서머타임에 흔들리지 않는다. */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / DAY_MS);
}

/**
 * 끝난 재배의 요약. 아직 안 끝났으면 null.
 *
 * 수확과 중단이 둘 다 찍혀 있으면 수확을 택한다 — 중단했다가 조금이라도 거뒀다면
 * 사용자에게는 거둔 쪽이 사실이다. DB 제약이 막지 않는 조합이라 여기서 정한다.
 */
export function buildHarvestSummary(
  input: HarvestSummaryInput,
): HarvestSummary | null {
  const endedOn = input.harvestedAt ?? input.failedAt;
  if (endedOn === null) return null;

  const ended = input.harvestedAt !== null ? "HARVESTED" : "FAILED";

  const window =
    input.sowingDate === null
      ? []
      : input.observations.filter(
          (row) => row.date >= (input.sowingDate ?? "") && row.date <= endedOn,
        );

  const grown =
    input.sowingDate === null
      ? 0
      : accumulateGdd(
          window,
          input.sowingDate,
          input.baseTempC,
          input.upperTempC ?? undefined,
        );

  return {
    endedOn,
    ended,
    totalDays:
      input.sowingDate === null
        ? null
        : Math.max(0, daysBetween(input.sowingDate, endedOn) + 1),
    totalGdd: Math.round((input.startGdd + grown) * 10) / 10,
    coveredDays: window.length,
    forecastErrorDays:
      ended === "HARVESTED" && input.firstForecastOn !== null
        ? daysBetween(input.firstForecastOn, endedOn)
        : null,
  };
}
