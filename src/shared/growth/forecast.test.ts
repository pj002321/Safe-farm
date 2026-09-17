import { describe, expect, it } from "vitest";
import {
  type ArrivalInput,
  forecastArrival_1,
  forecastArrival_2,
} from "./forecast";
import type { DailyTemp } from "./gdd";

/** 기준온도 5도에 최고 25·최저 15면 하루 15 GDD. 암산으로 검산되는 값이다. */
function day(date: string): DailyTemp {
  return { date, tempMaxC: 25, tempMinC: 15 };
}

const BASE: ArrivalInput = {
  accumulatedGdd: 0,
  targetGdd: 45,
  baseTempC: 5,
  upperTempC: null,
  forecast: [],
  recent: [],
  normals: [],
  today: "2026-09-17",
  horizonDays: 30,
};

describe("forecastArrival_1 — 최근 평균 반복", () => {
  it("예보만으로 목표에 닿으면 메우지 않는다", () => {
    const result = forecastArrival_1({
      ...BASE,
      forecast: [day("2026-09-18"), day("2026-09-19"), day("2026-09-20")],
    });

    expect(result.arrivalDate).toBe("2026-09-20");
    expect(result.daysLeft).toBe(3);
    expect(result.forecastDays).toBe(3);
    expect(result.extrapolated).toBe(false);
  });

  it("예보가 모자라면 최근 평균으로 이어 붙인다", () => {
    const result = forecastArrival_1({
      ...BASE,
      forecast: [day("2026-09-18")],
      recent: [day("2026-09-15"), day("2026-09-16")],
    });

    expect(result.arrivalDate).toBe("2026-09-20");
    expect(result.forecastDays).toBe(1);
    expect(result.extrapolated).toBe(true);
  });

  it("예보도 최근 관측도 없으면 모른다고 답한다", () => {
    const result = forecastArrival_1(BASE);

    expect(result.arrivalDate).toBeNull();
    expect(result.daysLeft).toBeNull();
  });

  it("이미 목표를 넘겼으면 오늘이다", () => {
    const result = forecastArrival_1({ ...BASE, accumulatedGdd: 60 });

    expect(result.arrivalDate).toBe("2026-09-17");
    expect(result.daysLeft).toBe(0);
  });

  it("기간 안에 못 닿으면 null 이다 — 임의의 먼 날짜를 내지 않는다", () => {
    const result = forecastArrival_1({
      ...BASE,
      targetGdd: 10_000,
      recent: [day("2026-09-16")],
      horizonDays: 7,
    });

    expect(result.arrivalDate).toBeNull();
  });
});

describe("forecastArrival_2 — 월별 평년값", () => {
  it("예보 밖은 그 달 평년값으로 메운다", () => {
    const result = forecastArrival_2({
      ...BASE,
      forecast: [day("2026-09-18")],
      normals: [{ month: 9, tempMaxC: 25, tempMinC: 15 }],
    });

    expect(result.arrivalDate).toBe("2026-09-20");
    expect(result.extrapolated).toBe(true);
  });

  it("평년값이 없으면 예보 끝에서 멈춘다", () => {
    const result = forecastArrival_2({
      ...BASE,
      forecast: [day("2026-09-18")],
      recent: [day("2026-09-16")],
    });

    expect(result.arrivalDate).toBeNull();
  });

  it("달이 바뀌면 그 달 평년값을 쓴다", () => {
    const result = forecastArrival_2({
      ...BASE,
      today: "2026-09-29",
      targetGdd: 30,
      normals: [
        { month: 9, tempMaxC: 25, tempMinC: 15 },
        { month: 10, tempMaxC: 15, tempMinC: 5 },
      ],
    });

    // 9/30 은 15, 10/1 은 5 → 이틀로는 20 이라 모자라고 10/2 에 25, 10/3 에 30.
    expect(result.arrivalDate).toBe("2026-10-03");
  });
});

describe("두 변형은 같은 자리에 꽂힌다", () => {
  it("입력이 같고 메울 구간이 없으면 답도 같다", () => {
    const input: ArrivalInput = {
      ...BASE,
      forecast: [day("2026-09-18"), day("2026-09-19"), day("2026-09-20")],
    };

    expect(forecastArrival_1(input)).toEqual(forecastArrival_2(input));
  });
});
