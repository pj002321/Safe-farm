import { describe, expect, it } from "vitest";
import type { PlotForecast } from "@/shared/aiService/client";
import { buildForecastAlerts, dayFlag } from "./forecastAlerts";

function day(
  date: string,
  tempMin: number | null,
  tempMax: number | null,
): PlotForecast["days"][number] {
  return {
    date,
    tempMin,
    tempMax,
    rainfallMm: 0,
    rainChance: 0,
    windMax: 1,
    humidityPct: 50,
  };
}

const CABBAGE: PlotForecast["cropImpact"] = {
  cropNameKo: "배추",
  baseTempC: 5,
  upperTempC: 25,
  stageName: "결구기",
  waterNeedMm: 25,
};

function forecast(over: Partial<PlotForecast> = {}): PlotForecast {
  return {
    current: null,
    hours: [],
    days: [day("2026-09-17", 15, 22)],
    rainfall3d: null,
    rainfall5d: null,
    rainfall7d: null,
    growthSeries: null,
    cropImpact: null,
    alert: null,
    ...over,
  };
}

describe("buildForecastAlerts", () => {
  it("아무 임계도 안 넘으면 한 장도 만들지 않는다 — 정상은 말이 없어야 한다", () => {
    expect(buildForecastAlerts(forecast({ cropImpact: CABBAGE }))).toEqual([]);
  });

  it("기상청 특보가 맨 위에 온다 — 우리 임계 판정보다 공식 발효가 먼저다", () => {
    const alerts = buildForecastAlerts(
      forecast({
        days: [day("2026-09-17", 1, 22)],
        alert: { warnings: ["호우", "강풍"], label: "호우주의보", asOf: null },
      }),
    );
    expect(alerts[0].id).toBe("official");
    // label 이 있으면 그걸 쓴다 — 주의보와 경보는 대응이 다르다.
    expect(alerts[0].titleKo).toBe("호우주의보 발효 중");
    expect(alerts[1].id).toBe("frost");
  });

  it("서리는 날짜를 묶어 한 장으로 낸다 — 날마다 한 장씩이면 카드가 경고로 덮인다", () => {
    const alerts = buildForecastAlerts(
      forecast({
        days: [
          day("2026-09-20", 1.5, 17),
          day("2026-09-21", 0.4, 16),
          day("2026-09-22", 12, 20),
        ],
      }),
    );
    const frost = alerts.find((a) => a.id === "frost");
    expect(frost?.dates).toEqual(["2026-09-20", "2026-09-21"]);
    expect(frost?.titleKo).toContain("2일");
    // 가장 낮은 값을 적는다 — 평균이나 첫날 값은 위험을 과소평가한다.
    expect(frost?.titleKo).toContain("0.4");
  });

  it("작물 기준이 없으면 고온·저온·관수를 판정하지 않는다", () => {
    const alerts = buildForecastAlerts(
      forecast({
        // 서리이면서 동시에 아주 더운 날. 작물 기준이 없으면 서리만 잡혀야 한다.
        days: [day("2026-09-17", 1.5, 40)],
        rainfall7d: 0,
        cropImpact: null,
      }),
    );
    expect(alerts.map((a) => a.id)).toEqual(["frost"]);
  });

  it("서리로 이미 잡힌 날은 저온 경고에서 뺀다 — 같은 날을 두 번 말하지 않는다", () => {
    const alerts = buildForecastAlerts(
      forecast({
        days: [day("2026-09-20", 1, 17), day("2026-09-21", 4, 16)],
        cropImpact: CABBAGE,
      }),
    );
    const cold = alerts.find((a) => a.id === "cold");
    expect(cold?.dates).toEqual(["2026-09-21"]);
  });

  it("7일 강수가 필요량에 못 미치면 부족분을 적어 관수를 권한다", () => {
    const alerts = buildForecastAlerts(
      forecast({ rainfall7d: 18.9, cropImpact: CABBAGE }),
    );
    const water = alerts.find((a) => a.id === "water");
    expect(water?.titleKo).toContain("6.1mm 부족");
  });

  it("필요량을 채웠으면 관수를 권하지 않는다", () => {
    const alerts = buildForecastAlerts(
      forecast({ rainfall7d: 30, cropImpact: CABBAGE }),
    );
    expect(alerts.find((a) => a.id === "water")).toBeUndefined();
  });

  it("관측이 없으면(null) 관수 판정을 보류한다 — 0mm 로 읽으면 안 된다", () => {
    const alerts = buildForecastAlerts(
      forecast({ rainfall7d: null, cropImpact: CABBAGE }),
    );
    expect(alerts.find((a) => a.id === "water")).toBeUndefined();
  });

  it("기온이 null 인 날은 어떤 판정에도 걸리지 않는다", () => {
    const alerts = buildForecastAlerts(
      forecast({ days: [day("2026-09-17", null, null)], cropImpact: CABBAGE }),
    );
    expect(alerts).toEqual([]);
  });
});

describe("buildForecastAlerts — 특보 label 이 없을 때", () => {
  it("label 이 없으면 특보 종류를 이어 붙인다", () => {
    const alerts = buildForecastAlerts(
      forecast({
        alert: { warnings: ["호우", "강풍"], label: null, asOf: null },
      }),
    );
    expect(alerts[0].titleKo).toBe("호우 · 강풍 발효 중");
  });
});

describe("buildForecastAlerts — 순서 보장", () => {
  it("가장 급한 것이 맨 앞이다 — 밭 목록 한 줄이 alerts[0] 을 대표로 쓴다", () => {
    const alerts = buildForecastAlerts(
      forecast({
        days: [day("2026-09-20", 1, 40), day("2026-09-21", 4, 16)],
        rainfall7d: 0,
        cropImpact: CABBAGE,
        alert: { warnings: ["호우"], label: "호우경보", asOf: null },
      }),
    );
    // 특보 → 서리 → 고온 → 저온 → 관수. 심각도가 뒤로 갈수록 낮아져야 한다.
    const rank = { danger: 0, caution: 1, info: 2 } as const;
    const tones = alerts.map((a) => rank[a.tone]);
    expect(tones).toEqual([...tones].sort((x, y) => x - y));
    expect(alerts[0].id).toBe("official");
  });

  it("경고 제목이 짧다 — 목록 한 줄(281px)에서 잘리면 안 된다", () => {
    const alerts = buildForecastAlerts(
      forecast({
        days: [day("2026-09-20", 18, 40), day("2026-09-21", 3, 16)],
        cropImpact: CABBAGE,
      }),
    );
    for (const alert of alerts) {
      expect(alert.titleKo.length).toBeLessThanOrEqual(20);
    }
    // 임계 근거는 사라진 게 아니라 본문으로 내려갔다.
    expect(alerts.find((a) => a.id === "hot")?.bodyKo).toContain("25℃");
    expect(alerts.find((a) => a.id === "cold")?.bodyKo).toContain("5℃");
  });
});

describe("dayFlag", () => {
  it("서리가 저온보다 먼저다 — 둘 다면 더 급한 쪽을 보여준다", () => {
    expect(dayFlag(day("2026-09-20", 1, 17), CABBAGE)).toBe("frost");
  });

  it("상한을 넘으면 고온", () => {
    expect(dayFlag(day("2026-09-20", 18, 31), CABBAGE)).toBe("hot");
  });

  it("기준온도 아래면 저온", () => {
    expect(dayFlag(day("2026-09-20", 4, 17), CABBAGE)).toBe("cold");
  });

  it("정상인 날은 아무 표시도 없다", () => {
    expect(dayFlag(day("2026-09-20", 12, 22), CABBAGE)).toBeNull();
  });

  it("작물 기준이 없어도 서리는 판정한다 — 작물과 무관한 물리 현상이다", () => {
    expect(dayFlag(day("2026-09-20", 1, 17), null)).toBe("frost");
    expect(dayFlag(day("2026-09-20", 18, 40), null)).toBeNull();
  });
});
