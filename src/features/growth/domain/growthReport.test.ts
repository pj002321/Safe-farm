import { describe, expect, it } from "vitest";
import { buildGrowthReport, type GrowthObservation } from "./growthReport";

/**
 * 리포트는 농민이 오늘 무엇을 할지 정하는 근거다. 여기서 문장이 한 번 틀리면
 * 물을 안 줘도 될 밭에 물을 주거나, 덮어야 할 밭을 그냥 둔다.
 * 그래서 경계값과 "절대 일어나면 안 되는 상태"를 먼저 고정한다.
 */

/** 사용자가 예시로 준 상황: 상추 32일째, 따뜻하고 건조했고, 내일 새벽이 춥다. */
const lettuceDay32: GrowthObservation = {
  cropId: "lettuce",
  daysSincePlanting: 32,
  recentAvgTempC: 24,
  recentRainMm: 2,
  sunshineHours: 6.5,
  forecastMinTempC: 3,
  forecastMaxTempC: 25,
  forecastRainMm: 1,
};

describe("buildGrowthReport — 기준 시나리오", () => {
  const report = buildGrowthReport(lettuceDay32);

  it("따뜻했으므로 표준보다 빠르다고 판정한다", () => {
    expect(report.pace).toBe("ahead");
    expect(report.paceDeltaDays).toBeGreaterThan(1);
  });

  it("32일째는 수확기다", () => {
    expect(report.stage.id).toBe("harvest");
    expect(report.cropNameKo).toBe("상추");
    expect(report.day).toBe(32);
  });

  it("① 요약이 '작물 + 며칠째 + 단계 조언' 순으로 조립된다", () => {
    expect(report.summary).toContain("상추를 심은 지 32일째예요.");
    expect(report.summary).toContain("지금은 수확기라,");
    expect(report.summary).toContain("빠른 편이에요");
  });

  it("② 표준 단계 설명에 구간과 전체 진행률이 들어간다", () => {
    expect(report.standardStage).toContain("파종 후 32일부터 44일까지가");
    expect(report.standardStage).toContain("전체 45일 과정");
  });

  it("④ 비가 거의 안 왔으므로 가뭄을 부족한 점으로 잡고 처방을 준다", () => {
    const drought = report.deficits.find((d) => d.id === "rain-short");
    expect(drought).toBeDefined();
    expect(drought?.detail).toContain("물을 충분히 주세요");
  });

  it("⑤ 내일 새벽 3도이므로 냉해 경보를 12시간 선행으로 낸다", () => {
    const frost = report.alerts.find((a) => a.id === "alert-frost");
    expect(frost).toBeDefined();
    expect(frost?.leadTimeHours).toBe(12);
    expect(frost?.action).toBe("부직포나 비닐을 덮어두세요.");
  });
});

describe("buildGrowthReport — 입력 방어", () => {
  it("모르는 작물은 기본값으로 넘어가지 않고 던진다", () => {
    expect(() =>
      buildGrowthReport({ ...lettuceDay32, cropId: "durian" }),
    ).toThrow("알 수 없는 작물: durian");
  });

  it("progress 는 어떤 일수에도 0~1 을 벗어나지 않는다", () => {
    for (const day of [-10, 0, 32, 45, 9999]) {
      const p = buildGrowthReport({
        ...lettuceDay32,
        daysSincePlanting: day,
      }).progress;
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });
});

describe("경보 경계값", () => {
  it("예상 최저기온이 임계와 정확히 같으면 냉해 경보가 뜬다", () => {
    // 상추 frostRiskBelowC = 4
    const onEdge = buildGrowthReport({ ...lettuceDay32, forecastMinTempC: 4 });
    expect(onEdge.alerts.some((a) => a.id === "alert-frost")).toBe(true);

    const justAbove = buildGrowthReport({
      ...lettuceDay32,
      forecastMinTempC: 4.1,
    });
    expect(justAbove.alerts.some((a) => a.id === "alert-frost")).toBe(false);
  });

  it("예상 최고기온이 임계와 같으면 고온 경보가 24시간 선행으로 뜬다", () => {
    // 상추 heatRiskAboveC = 26
    const heat = buildGrowthReport({ ...lettuceDay32, forecastMaxTempC: 26 });
    const alert = heat.alerts.find((a) => a.id === "alert-heat");
    expect(alert?.leadTimeHours).toBe(24);
  });

  it("사흘 80mm 예보면 침수 경보를 낸다", () => {
    const flood = buildGrowthReport({ ...lettuceDay32, forecastRainMm: 80 });
    expect(flood.alerts.some((a) => a.id === "alert-flood")).toBe(true);
  });

  it("아무 조건도 걸리지 않으면 경보는 빈 배열이다", () => {
    const calm = buildGrowthReport({
      cropId: "lettuce",
      daysSincePlanting: 20,
      recentAvgTempC: 18,
      recentRainMm: 25,
      sunshineHours: 6,
      forecastMinTempC: 12,
      forecastMaxTempC: 22,
      forecastRainMm: 20,
    });
    expect(calm.alerts).toEqual([]);
  });
});

describe("strengths 는 절대 비지 않는다", () => {
  it("모든 조건이 최악이어도 최소 한 가지는 남는다", () => {
    const worst = buildGrowthReport({
      cropId: "lettuce",
      daysSincePlanting: 9999,
      recentAvgTempC: -20,
      recentRainMm: 0,
      sunshineHours: 0,
      forecastMinTempC: -30,
      forecastMaxTempC: -10,
      forecastRainMm: 0,
    });
    expect(worst.strengths.length).toBeGreaterThan(0);
    expect(worst.strengths[0].id).toBe("stage-normal");
  });

  it("note id 는 서로 겹치지 않는다 (React key 로 쓴다)", () => {
    const r = buildGrowthReport(lettuceDay32);
    const ids = [...r.strengths, ...r.deficits, ...r.alerts].map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("다른 작물도 같은 규칙으로 조립된다", () => {
  it("토마토는 자기 기준(18~27도)으로 판정한다", () => {
    const tomato = buildGrowthReport({
      cropId: "tomato",
      daysSincePlanting: 80,
      recentAvgTempC: 24,
      recentRainMm: 30,
      sunshineHours: 7,
      forecastMinTempC: 15,
      forecastMaxTempC: 28,
      forecastRainMm: 10,
    });
    // 상추에서는 고온이던 24도가 토마토에서는 적정이다.
    expect(tomato.pace).toBe("onTrack");
    expect(tomato.strengths.some((s) => s.id === "temp-ok")).toBe(true);
    expect(tomato.summary).toContain("토마토를 심은 지 80일째예요.");
  });
});
