import { describe, expect, it } from "vitest";
import type { PlotForecast } from "@/shared/aiService/client";
import { splitWeek, workability } from "./weekSplit";

function day(over: Partial<PlotForecast["days"][number]> = {}) {
  return {
    date: "2026-09-17",
    tempMin: 15,
    tempMax: 22,
    rainfallMm: 0,
    rainChance: 5,
    windMax: 2,
    humidityPct: 60,
    ...over,
  };
}

const CABBAGE: PlotForecast["cropImpact"] = {
  cropNameKo: "배추",
  baseTempC: 5,
  upperTempC: 25,
  stageName: "결구기",
  waterNeedMm: 25,
};

describe("workability — 급한 것부터 본다", () => {
  it("서리가 비보다 먼저다", () => {
    const r = workability(day({ tempMin: 1, rainfallMm: 20 }), CABBAGE);
    expect(r.icon).toBe("frost");
    expect(r.workableKo).toContain("서리");
  });

  it("바람이 비보다 먼저다 — 비는 젖는 것이고 바람은 못 하는 것이다", () => {
    const r = workability(day({ windMax: 12, rainfallMm: 20 }), CABBAGE);
    expect(r.icon).toBe("wind");
    expect(r.workableKo).toContain("12m/s");
  });

  it("강수량이 적어도 확률이 높으면 비를 전제로 말한다", () => {
    const r = workability(day({ rainfallMm: 0, rainChance: 70 }), CABBAGE);
    expect(r.icon).toBe("rain");
    expect(r.workableKo).toContain("70%");
  });

  it("확률이 낮고 비도 없으면 비 이야기를 안 한다", () => {
    expect(workability(day({ rainChance: 30 }), CABBAGE).icon).toBe("sun");
  });

  it("작물 상한을 넘으면 한낮을 피하라고 한다", () => {
    const r = workability(day({ tempMax: 31 }), CABBAGE);
    expect(r.workableKo).toContain("이른 아침");
  });

  it("작물 기준이 없으면 고온 판단을 하지 않는다 — 근거 없는 판단은 안 한다", () => {
    expect(workability(day({ tempMax: 40 }), null).workableKo).toBe(
      "야외 작업하기 좋습니다",
    );
  });

  it("아무 임계도 안 넘으면 좋다고 말한다", () => {
    expect(workability(day(), CABBAGE).workableKo).toBe(
      "야외 작업하기 좋습니다",
    );
  });

  it("기온을 모르면 '좋습니다'라고 단정하지 않는다 — 서리·고온 판정 자체가 불가능한 날이다", () => {
    const r = workability(
      day({ tempMin: null, tempMax: null, rainfallMm: 0, rainChance: 5 }),
      CABBAGE,
    );
    expect(r.workableKo).toBe("기온 예보가 없어 판단을 보류합니다");
  });

  it("바람만 알아도 그 판정은 한다 — 아는 것까지 지우지 않는다", () => {
    const r = workability(
      day({
        tempMin: null,
        tempMax: null,
        rainfallMm: null,
        rainChance: null,
        windMax: 14,
      }),
      CABBAGE,
    );
    expect(r.icon).toBe("wind");
  });

  it("실제 예보값(m/s)으로 흔한 바람은 강풍이 아니다", () => {
    // ⚠️ Open-Meteo 기본 단위는 km/h 다. 단위를 안 박으면 이 값들이 3~4 m/s 인데
    //    9 를 넘겨 전부 강풍이 된다. ai-service 가 wind_speed_unit=ms 를 지정한다.
    for (const windMax of [3.2, 4.1, 5.5]) {
      expect(workability(day({ windMax }), CABBAGE).icon).not.toBe("wind");
    }
  });

  it("값이 전부 없으면 지어내지 않고 '예보 없음'이다", () => {
    const r = workability(
      day({
        tempMin: null,
        tempMax: null,
        rainfallMm: null,
        rainChance: null,
        windMax: null,
      }),
      CABBAGE,
    );
    expect(r.workableKo).toBe("예보가 없습니다");
  });
});

describe("splitWeek", () => {
  // 2026-09-17 은 목요일. 19(토) · 20(일) 이 주말이다.
  const week = [
    "2026-09-17",
    "2026-09-18",
    "2026-09-19",
    "2026-09-20",
    "2026-09-21",
    "2026-09-22",
    "2026-09-23",
  ].map((date) => day({ date }));

  it("토·일만 주말로 간다", () => {
    const { weekdays, weekend } = splitWeek(week, CABBAGE);
    expect(weekend.map((d) => d.date)).toEqual(["2026-09-19", "2026-09-20"]);
    expect(weekdays).toHaveLength(5);
  });

  it("요일 이름과 날짜를 함께 낸다 — 요일만으로는 다음 주인지 모른다", () => {
    const { weekend } = splitWeek(week, CABBAGE);
    expect(weekend[0].labelKo).toBe("토요일");
    expect(weekend[0].dateKo).toBe("9/19");
  });

  it("빈 예보에도 빈 배열 둘을 낸다 — 화면이 undefined 를 그리면 안 된다", () => {
    const { weekdays, weekend } = splitWeek([], CABBAGE);
    expect(weekdays).toEqual([]);
    expect(weekend).toEqual([]);
  });

  it("주말이 하나도 없는 구간도 성립한다(월~금만 온 경우)", () => {
    const { weekdays, weekend } = splitWeek(week.slice(4, 6), CABBAGE);
    expect(weekend).toEqual([]);
    expect(weekdays).toHaveLength(2);
  });
});
