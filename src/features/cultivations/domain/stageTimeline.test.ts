import { describe, expect, it } from "vitest";
import type { DailyTemp } from "@/shared/growth/gdd";
import type { StageRow } from "./growthGauge";
import { buildStageTimeline, type StageTimelineInput } from "./stageTimeline";

const STAGES: readonly StageRow[] = [
  {
    stageOrder: 1,
    stageNameKo: "발아기",
    gddFrom: 0,
    gddTo: 30,
    guideKo: null,
  },
  {
    stageOrder: 2,
    stageNameKo: "생육기",
    gddFrom: 30,
    gddTo: 75,
    guideKo: "웃거름",
  },
  {
    stageOrder: 3,
    stageNameKo: "결구기",
    gddFrom: 75,
    gddTo: 150,
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

const BASE: StageTimelineInput = {
  stages: STAGES,
  sowingDate: "2026-09-01",
  startGdd: 0,
  accumulatedGdd: 60,
  observations: days("2026-09-01", 4),
  baseTempC: 5,
  upperTempC: null,
  perDayGdd: 15,
  today: "2026-09-04",
};

describe("buildStageTimeline", () => {
  it("단계 순서대로 나오고 현재 단계가 하나다", () => {
    const steps = buildStageTimeline(BASE);

    expect(steps.map((s) => s.nameKo)).toEqual(["발아기", "생육기", "결구기"]);
    expect(steps.filter((s) => s.state === "current")).toHaveLength(1);
    expect(steps[1].state).toBe("current");
    expect(steps[0].state).toBe("done");
    expect(steps[2].state).toBe("upcoming");
  });

  it("지난 단계의 도달일은 관측에서 나온 실측일이다", () => {
    const steps = buildStageTimeline(BASE);

    // 9/1 에 15, 9/2 에 30 → 30 을 처음 넘은 날이 9/2.
    expect(steps[1].reachedOn).toBe("2026-09-02");
    expect(steps[1].reachedKind).toBe("observed");
  });

  it("첫 단계는 파종일에 도달한 것으로 본다", () => {
    const steps = buildStageTimeline(BASE);

    expect(steps[0].reachedOn).toBe("2026-09-01");
    expect(steps[0].reachedKind).toBe("observed");
  });

  it("앞 단계는 하루 평균으로 민 추정일이다", () => {
    const steps = buildStageTimeline(BASE);

    // 75 까지 15 남았고 하루 15 → 하루 뒤.
    expect(steps[2].reachedOn).toBe("2026-09-05");
    expect(steps[2].reachedKind).toBe("estimated");
  });

  it("하루 평균이 0 이면 앞 단계 날짜를 비운다", () => {
    const steps = buildStageTimeline({ ...BASE, perDayGdd: 0 });

    expect(steps[2].reachedOn).toBeNull();
    expect(steps[2].reachedKind).toBeNull();
  });

  it("파종일을 모르면 실측 도달일이 없다", () => {
    const steps = buildStageTimeline({ ...BASE, sowingDate: null });

    expect(steps[0].reachedKind).not.toBe("observed");
  });

  it("마지막 단계를 넘기면 현재 단계가 없다", () => {
    const steps = buildStageTimeline({ ...BASE, accumulatedGdd: 200 });

    expect(steps.every((s) => s.state === "done")).toBe(true);
  });

  it("단계표가 비면 빈 배열이다", () => {
    expect(buildStageTimeline({ ...BASE, stages: [] })).toEqual([]);
  });

  it("모종으로 시작해 이미 넘어선 단계는 파종일 도달로 본다", () => {
    const steps = buildStageTimeline({
      ...BASE,
      startGdd: 30,
      accumulatedGdd: 90,
    });

    expect(steps[1].reachedOn).toBe("2026-09-01");
    expect(steps[1].reachedKind).toBe("observed");
  });
});
