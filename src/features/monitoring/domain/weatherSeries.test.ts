import { describe, expect, it } from "vitest";
import {
  buildWeatherSeries,
  summarizeWeather,
  type WeatherSeriesInput,
} from "./weatherSeries";

const BASE: WeatherSeriesInput = {
  today: "2026-09-17",
  days: 7,
  pastDays: 3,
  observations: [],
  forecast: [],
};

describe("buildWeatherSeries", () => {
  it("기준일 앞뒤로 정해진 날 수만큼 축을 만든다", () => {
    const series = buildWeatherSeries(BASE);

    expect(series.points).toHaveLength(7);
    expect(series.points[0].date).toBe("2026-09-14");
    expect(series.points[6].date).toBe("2026-09-20");
  });

  it("값이 없으면 메우지 않고 없는 채로 둔다", () => {
    const series = buildWeatherSeries(BASE);

    expect(series.points.every((p) => p.source === "none")).toBe(true);
    expect(series.points[0].rainfallMm).toBeNull();
    expect(series.tempDomain).toBeNull();
    expect(series.filledDays).toBe(0);
  });

  it("관측과 예보를 출처로 구분한다", () => {
    const series = buildWeatherSeries({
      ...BASE,
      observations: [
        { date: "2026-09-15", tempMaxC: 26, tempMinC: 16, rainfallMm: 0 },
      ],
      forecast: [
        { date: "2026-09-19", tempMaxC: 24, tempMinC: 15, rainfallMm: 10 },
      ],
    });

    expect(series.points[1].source).toBe("observed");
    expect(series.points[5].source).toBe("forecast");
    expect(series.filledDays).toBe(2);
  });

  it("같은 날에 둘 다 있으면 관측이 이긴다", () => {
    const series = buildWeatherSeries({
      ...BASE,
      observations: [
        { date: "2026-09-15", tempMaxC: 26, tempMinC: 16, rainfallMm: 0 },
      ],
      forecast: [
        { date: "2026-09-15", tempMaxC: 30, tempMinC: 20, rainfallMm: 5 },
      ],
    });

    expect(series.points[1].source).toBe("observed");
    expect(series.points[1].tempMaxC).toBe(26);
  });

  it("기온 축은 값 위아래로 여유를 둔다", () => {
    const series = buildWeatherSeries({
      ...BASE,
      observations: [
        { date: "2026-09-15", tempMaxC: 26, tempMinC: 16, rainfallMm: null },
      ],
    });

    expect(series.tempDomain).toEqual({ lo: 14, hi: 28 });
  });

  it("축 라벨은 MM-DD 다", () => {
    expect(buildWeatherSeries(BASE).points[0].monthDay).toBe("09-14");
  });

  it("강수 최댓값은 있는 값에서만 고른다", () => {
    const series = buildWeatherSeries({
      ...BASE,
      observations: [
        { date: "2026-09-15", tempMaxC: null, tempMinC: null, rainfallMm: 12 },
        {
          date: "2026-09-16",
          tempMaxC: null,
          tempMinC: null,
          rainfallMm: null,
        },
      ],
    });

    expect(series.rainfallMax).toBe(12);
  });
});

describe("summarizeWeather", () => {
  it("관측만 센다 — 예보는 요약에 안 들어간다", () => {
    const series = buildWeatherSeries({
      ...BASE,
      observations: [
        { date: "2026-09-15", tempMaxC: 20, tempMinC: 10, rainfallMm: 1 },
        { date: "2026-09-16", tempMaxC: 30, tempMinC: 20, rainfallMm: 3 },
      ],
      forecast: [
        { date: "2026-09-19", tempMaxC: 40, tempMinC: 30, rainfallMm: 100 },
      ],
    });

    expect(summarizeWeather(series)).toEqual({
      days: 2,
      avgTempMaxC: 25,
      avgTempMinC: 15,
      rainfallMm: 4,
    });
  });

  it("관측이 하나도 없으면 null", () => {
    expect(summarizeWeather(buildWeatherSeries(BASE))).toBeNull();
  });

  it("강수량을 하나도 모르면 null 로 둔다 — 0 으로 말하지 않는다", () => {
    const series = buildWeatherSeries({
      ...BASE,
      observations: [
        { date: "2026-09-15", tempMaxC: 20, tempMinC: 10, rainfallMm: null },
      ],
    });

    expect(summarizeWeather(series)?.rainfallMm).toBeNull();
  });
});
