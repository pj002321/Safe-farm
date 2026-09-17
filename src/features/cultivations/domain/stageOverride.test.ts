import { describe, expect, it } from "vitest";
import type { DailyTemp } from "@/shared/growth/gdd";
import type { StageRow } from "./growthGauge";
import { type RebaseInput, rebaseGdd_1, rebaseGdd_2 } from "./stageOverride";

const STAGES: readonly StageRow[] = [
  {
    stageOrder: 1,
    stageNameKo: "발아기",
    gddFrom: 0,
    gddTo: 100,
    guideKo: null,
  },
  {
    stageOrder: 2,
    stageNameKo: "생육기",
    gddFrom: 100,
    gddTo: 300,
    guideKo: null,
  },
  {
    stageOrder: 3,
    stageNameKo: "결구기",
    gddFrom: 300,
    gddTo: 500,
    guideKo: null,
  },
];

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

const BASE: RebaseInput = {
  override: null,
  stages: STAGES,
  originalBaseGdd: 0,
  originalFrom: "2026-09-01",
  observations: days("2026-09-01", 10),
  baseTempC: 5,
  upperTempC: null,
};

describe("보정이 없을 때", () => {
  it("두 변형 모두 원래 값을 그대로 둔다", () => {
    expect(rebaseGdd_1(BASE)).toEqual({
      baseGdd: 0,
      accumulateFrom: "2026-09-01",
      applied: false,
    });
    expect(rebaseGdd_2(BASE)).toEqual(rebaseGdd_1(BASE));
  });

  it("품종을 바꿔 단계가 사라졌으면 적용하지 않는다", () => {
    const input: RebaseInput = {
      ...BASE,
      override: { stageOrder: 99, occurredOn: "2026-09-05" },
    };

    expect(rebaseGdd_1(input).applied).toBe(false);
    expect(rebaseGdd_2(input).applied).toBe(false);
  });
});

describe("rebaseGdd_1 — 보정일이 새 출발선", () => {
  it("지목한 단계의 gddFrom 에서 보정일부터 다시 쌓는다", () => {
    const result = rebaseGdd_1({
      ...BASE,
      override: { stageOrder: 3, occurredOn: "2026-09-05" },
    });

    expect(result).toEqual({
      baseGdd: 300,
      accumulateFrom: "2026-09-05",
      applied: true,
    });
  });
});

describe("rebaseGdd_2 — 어긋난 만큼 평행이동", () => {
  it("보정일까지의 계산값과 지목한 단계의 차이를 오프셋으로 잡는다", () => {
    // 9/1~9/5 다섯 날 × 15 = 75. 사용자는 결구기(300)라고 했으므로 +225.
    const result = rebaseGdd_2({
      ...BASE,
      override: { stageOrder: 3, occurredOn: "2026-09-05" },
    });

    expect(result).toEqual({
      baseGdd: 225,
      accumulateFrom: "2026-09-01",
      applied: true,
    });
  });

  it("계산이 앞서 있었으면 오프셋이 음수다", () => {
    const result = rebaseGdd_2({
      ...BASE,
      override: { stageOrder: 1, occurredOn: "2026-09-10" },
    });

    // 열흘 × 15 = 150 인데 사용자는 아직 발아기(0)라고 했다.
    expect(result.baseGdd).toBe(-150);
  });

  it("파종일을 모르면 오프셋이 곧 지목한 단계의 시작값이다", () => {
    const result = rebaseGdd_2({
      ...BASE,
      originalFrom: null,
      override: { stageOrder: 2, occurredOn: "2026-09-05" },
    });

    expect(result.baseGdd).toBe(100);
    expect(result.accumulateFrom).toBeNull();
  });
});
