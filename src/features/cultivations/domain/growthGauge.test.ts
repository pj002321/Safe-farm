import { describe, expect, it } from "vitest";
import {
  buildGrowthGauge,
  type GrowthGaugeInput,
  type StageRow,
} from "./growthGauge";

/** 반개구간 세 칸. 마지막 `gddTo` 가 곧 수확 목표다. */
const STAGES: StageRow[] = [
  {
    stageOrder: 1,
    stageNameKo: "발아기",
    gddFrom: 0,
    gddTo: 100,
    guideKo: null,
  },
  {
    stageOrder: 2,
    stageNameKo: "생장기",
    gddFrom: 100,
    gddTo: 300,
    guideKo: "웃거름을 준다",
  },
  {
    stageOrder: 3,
    stageNameKo: "결구기",
    gddFrom: 300,
    gddTo: 500,
    guideKo: null,
  },
];

/** 기준온도 5℃ 기준 하루치는 각각 15.55 · 16.6 · 16.9 → 합 49.1. */
const OBSERVATIONS = [
  { date: "2026-09-11", tempMinC: 14.0, tempMaxC: 27.1 },
  { date: "2026-09-12", tempMinC: 15.1, tempMaxC: 28.1 },
  { date: "2026-09-13", tempMinC: 15.0, tempMaxC: 28.8 },
];

function input(over: Partial<GrowthGaugeInput> = {}): GrowthGaugeInput {
  return {
    sowingDate: "2026-09-11",
    startStageOrder: null,
    baseTempC: 5,
    upperTempC: null,
    gddTarget: 500,
    stages: STAGES,
    observations: OBSERVATIONS,
    today: "2026-09-13",
    ...over,
  };
}

describe("buildGrowthGauge", () => {
  it("씨부터면 0 에서 시작해 관측만 쌓는다", () => {
    const gauge = buildGrowthGauge(input());
    expect(gauge?.accumulatedGdd).toBe(49.1);
    expect(gauge?.stage?.stageNameKo).toBe("발아기");
  });

  it("모종은 시작 단계의 gdd_from 부터 쌓는다", () => {
    // 육묘장에서 이미 먹고 온 열을 0 으로 치면 단계가 통째로 뒤로 밀린다.
    const gauge = buildGrowthGauge(input({ startStageOrder: 2 }));
    expect(gauge?.accumulatedGdd).toBe(149.1);
    expect(gauge?.stage?.stageNameKo).toBe("생장기");
  });

  it("구간은 반개구간이다 — 경계 GDD 는 다음 단계로 간다", () => {
    // gdd_to 를 포함하면 경계에서 두 단계에 동시에 걸린다.
    const gauge = buildGrowthGauge(
      input({ startStageOrder: 2, observations: [], sowingDate: null }),
    );
    expect(gauge?.accumulatedGdd).toBe(100);
    expect(gauge?.stage?.stageOrder).toBe(2);
  });

  it("적산을 시작할 지점이 없으면 null — 아직 심지 않은 밭", () => {
    expect(
      buildGrowthGauge(input({ sowingDate: null, startStageOrder: null })),
    ).toBeNull();
  });

  it("마지막 구간을 넘기면 단계가 null 이다 — 수확기를 지났다", () => {
    // 49.1 이 마지막 단계의 gdd_to(40)를 넘었다. 마지막 단계에 붙여 두면
    // 영영 그 단계에 머문 것처럼 보인다.
    const gauge = buildGrowthGauge(
      input({
        stages: [
          {
            stageOrder: 1,
            stageNameKo: "발아기",
            gddFrom: 0,
            gddTo: 40,
            guideKo: null,
          },
        ],
        gddTarget: 40,
      }),
    );
    expect(gauge?.accumulatedGdd).toBe(49.1);
    expect(gauge?.stage).toBeNull();
    expect(gauge?.markRatio).toBeNull();
  });

  it("눈금은 다음 단계가 시작되는 지점이다", () => {
    const gauge = buildGrowthGauge(input());
    expect(gauge?.markRatio).toBeCloseTo(0.2, 5); // 100 / 500
  });

  it("진행률은 목표를 넘겨도 1 을 넘지 않는다", () => {
    const gauge = buildGrowthGauge(input({ gddTarget: 10 }));
    expect(gauge?.ratio).toBe(1);
  });

  it("관측이 빠진 날을 셀 수 있게 covered/expected 를 함께 돌려준다", () => {
    // 09-08 에 심었는데 관측은 09-11 부터다. 빠진 사흘은 0 으로 더해져
    // 누적이 실제보다 낮다 — 화면이 그 사실을 말할 수 있어야 한다.
    const gauge = buildGrowthGauge(input({ sowingDate: "2026-09-08" }));
    expect(gauge?.coveredDays).toBe(3);
    expect(gauge?.expectedDays).toBe(6);
  });

  it("오늘 이후 행은 관측 일수로 세지 않는다", () => {
    const gauge = buildGrowthGauge(
      input({
        observations: [
          ...OBSERVATIONS,
          { date: "2026-09-14", tempMinC: 15, tempMaxC: 28 },
        ],
      }),
    );
    expect(gauge?.coveredDays).toBe(3);
    expect(gauge?.expectedDays).toBe(3);
  });

  it("최근 기온으로 남은 일수를 추정한다", () => {
    const gauge = buildGrowthGauge(input());
    // 49.1 쌓였고 하루 16.4 씩이면 450.9 / 16.4 ≈ 27일.
    expect(gauge?.daysLeft).toBe(27);
  });

  it("기온이 기준 아래로만 이어지면 남은 일수는 null", () => {
    const gauge = buildGrowthGauge(
      input({
        observations: [{ date: "2026-09-13", tempMinC: -5, tempMaxC: 2 }],
        sowingDate: "2026-09-13",
      }),
    );
    expect(gauge?.daysLeft).toBeNull();
  });
});
