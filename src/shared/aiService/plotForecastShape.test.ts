import { describe, expect, it } from "vitest";
import { normalizePlotForecast } from "./plotForecastShape";

/**
 * 이 테스트의 전부는 **배포 순서**다. Next 와 ai-service 는 따로 배포되므로,
 * 새 화면이 옛 ai-service 응답을 받는 창이 반드시 생긴다.
 */

/** 배포 중인 ai-service(origin/main)가 실제로 주는 응답. 이게 전부다. */
const OLD_RESPONSE = {
  days: [
    {
      date: "2026-09-17",
      tempMax: 28.4,
      tempMin: 17.2,
      rainfallMm: 0,
      windMax: 3.2,
    },
  ],
};

describe("normalizePlotForecast", () => {
  it("옛 ai-service 응답(days 만)에도 hours 가 배열이다 — 여기가 페이지를 통째로 죽이던 지점", () => {
    const data = normalizePlotForecast(OLD_RESPONSE);
    expect(Array.isArray(data.hours)).toBe(true);
    expect(data.hours).toHaveLength(0);
    // 화면이 바로 부르는 것들이 던지지 않아야 한다.
    expect(() => data.hours.length).not.toThrow();
    expect(() => data.days.map((d) => d.date)).not.toThrow();
  });

  it("옛 응답에서 새 필드는 전부 '없음'이다 — 0 이나 빈 객체로 지어내지 않는다", () => {
    const data = normalizePlotForecast(OLD_RESPONSE);
    expect(data.current).toBeNull();
    expect(data.alert).toBeNull();
    expect(data.cropImpact).toBeNull();
    expect(data.growthSeries).toBeNull();
    expect(data.rainfall3d).toBeNull();
    expect(data.rainfall5d).toBeNull();
    expect(data.rainfall7d).toBeNull();
  });

  it("옛 응답의 days 는 그대로 살아 있다 — 폴백이 아니라 실제 예보다", () => {
    const data = normalizePlotForecast(OLD_RESPONSE);
    expect(data.days).toHaveLength(1);
    expect(data.days[0].tempMax).toBe(28.4);
  });

  it("완전히 엉뚱한 응답에도 모양이 성립한다", () => {
    for (const junk of [
      null,
      undefined,
      "nope",
      42,
      [],
      { days: "not-array" },
    ]) {
      const data = normalizePlotForecast(junk);
      expect(Array.isArray(data.days)).toBe(true);
      expect(Array.isArray(data.hours)).toBe(true);
      expect(data.current).toBeNull();
    }
  });

  it("warnings 가 배열이 아닌 특보는 없는 것으로 친다 — 경보 화면에 반쪽을 그리지 않는다", () => {
    expect(
      normalizePlotForecast({ ...OLD_RESPONSE, alert: { label: "호우주의보" } })
        .alert,
    ).toBeNull();
  });

  it("정상 응답은 값을 그대로 통과시킨다", () => {
    const full = {
      ...OLD_RESPONSE,
      current: {
        observedAt: "2026-09-17T09:00",
        tempC: 21.3,
        humidityPct: 62,
        rainfallMm: 0,
        windMs: 3.4,
      },
      hours: [
        {
          time: "2026-09-17T09:00",
          tempC: 21.3,
          rainfallMm: 0,
          rainChance: 10,
        },
      ],
      rainfall3d: 15.7,
      rainfall5d: 18.9,
      rainfall7d: 18.9,
      growthSeries: [{ date: "2026-09-16", gdd: 12.4 }],
      cropImpact: {
        cropNameKo: "배추",
        baseTempC: 5,
        upperTempC: 25,
        stageName: "결구기",
        waterNeedMm: 25,
      },
      alert: {
        warnings: ["강풍"],
        label: "강풍주의보",
        asOf: "2026-09-17T08:00:00",
      },
    };
    const data = normalizePlotForecast(full);
    expect(data.hours).toHaveLength(1);
    expect(data.current?.tempC).toBe(21.3);
    expect(data.alert?.warnings).toEqual(["강풍"]);
    expect(data.growthSeries).toHaveLength(1);
    expect(data.rainfall7d).toBe(18.9);
  });

  it("빈 배열과 null 을 구별한다 — growthSeries 빈 배열은 '작물 없음'이 아니다", () => {
    expect(
      normalizePlotForecast({ ...OLD_RESPONSE, growthSeries: [] }).growthSeries,
    ).toEqual([]);
    expect(normalizePlotForecast(OLD_RESPONSE).growthSeries).toBeNull();
  });
});
