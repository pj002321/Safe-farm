import { describe, expect, it } from "vitest";
import type { DailyTemp } from "@/shared/growth/gdd";
import {
  buildHarvestSummary,
  type HarvestSummaryInput,
} from "./harvestSummary";

/** 기준온도 5도에 25/15 면 하루 15 GDD. */
function days(from: string, count: number): DailyTemp[] {
  const rows: DailyTemp[] = [];
  let stamp = Date.parse(`${from}T00:00:00Z`);
  for (let i = 0; i < count; i += 1) {
    rows.push({
      date: new Date(stamp).toISOString().slice(0, 10),
      tempMaxC: 25,
      tempMinC: 15,
    });
    stamp += 86_400_000;
  }
  return rows;
}

const BASE: HarvestSummaryInput = {
  sowingDate: "2026-09-01",
  harvestedAt: "2026-09-10",
  failedAt: null,
  startGdd: 0,
  observations: days("2026-09-01", 10),
  baseTempC: 5,
  upperTempC: null,
  firstForecastOn: null,
};

describe("buildHarvestSummary", () => {
  it("아직 안 끝났으면 null", () => {
    expect(buildHarvestSummary({ ...BASE, harvestedAt: null })).toBeNull();
  });

  it("총 일수는 파종일 당일을 포함한다", () => {
    expect(buildHarvestSummary(BASE)?.totalDays).toBe(10);
  });

  it("총 GDD 를 관측에서 다시 합산한다", () => {
    expect(buildHarvestSummary(BASE)?.totalGdd).toBe(150);
  });

  it("모종으로 시작했으면 시작 GDD 를 더한다", () => {
    expect(buildHarvestSummary({ ...BASE, startGdd: 100 })?.totalGdd).toBe(250);
  });

  it("끝난 날 이후 관측은 세지 않는다", () => {
    const summary = buildHarvestSummary({
      ...BASE,
      observations: days("2026-09-01", 30),
    });

    expect(summary?.coveredDays).toBe(10);
    expect(summary?.totalGdd).toBe(150);
  });

  it("관측이 비면 covered 가 총 일수보다 적다", () => {
    const summary = buildHarvestSummary({
      ...BASE,
      observations: days("2026-09-01", 4),
    });

    expect(summary?.coveredDays).toBe(4);
    expect(summary?.totalDays).toBe(10);
  });

  it("예측보다 일찍 거뒀으면 오차가 음수다", () => {
    const summary = buildHarvestSummary({
      ...BASE,
      firstForecastOn: "2026-09-13",
    });

    expect(summary?.forecastErrorDays).toBe(-3);
  });

  it("중단한 건은 예측 오차를 내지 않는다", () => {
    const summary = buildHarvestSummary({
      ...BASE,
      harvestedAt: null,
      failedAt: "2026-09-08",
      firstForecastOn: "2026-09-13",
    });

    expect(summary?.ended).toBe("FAILED");
    expect(summary?.forecastErrorDays).toBeNull();
  });

  it("수확과 중단이 둘 다 찍혀 있으면 수확을 택한다", () => {
    const summary = buildHarvestSummary({ ...BASE, failedAt: "2026-09-05" });

    expect(summary?.ended).toBe("HARVESTED");
    expect(summary?.endedOn).toBe("2026-09-10");
  });

  it("파종일을 모르면 일수를 내지 않는다", () => {
    const summary = buildHarvestSummary({ ...BASE, sowingDate: null });

    expect(summary?.totalDays).toBeNull();
    expect(summary?.totalGdd).toBe(0);
  });
});
