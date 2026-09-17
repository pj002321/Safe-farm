import { describe, expect, it } from "vitest";
import {
  recommendTasks_1,
  recommendTasks_2,
  type TaskWeather,
} from "./taskAdvice";

const MILD: TaskWeather = {
  days: 7,
  avgTempMaxC: 26,
  avgTempMinC: 16,
  rainfallMm: 30,
};

describe("recommendTasks_1 — 단계만", () => {
  it("단계 이름이 부분 일치하면 그 묶음을 낸다", () => {
    const ids = recommendTasks_1({ stageNameKo: "결구기", weather: null }).map(
      (t) => t.id,
    );

    expect(ids).toContain("stage-bulk-water");
  });

  it("표기가 달라도 같은 묶음으로 잡는다", () => {
    const a = recommendTasks_1({ stageNameKo: "발아기", weather: null });
    const b = recommendTasks_1({ stageNameKo: "출아기", weather: null });

    expect(a).toEqual(b);
  });

  it("단계를 모르면 일반 작업을 낸다 — 빈 목록을 내지 않는다", () => {
    const tasks = recommendTasks_1({ stageNameKo: null, weather: null });

    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks[0].id).toMatch(/^generic-/);
  });

  it("기상을 넘겨도 답이 바뀌지 않는다", () => {
    const withWeather = recommendTasks_1({
      stageNameKo: "결구기",
      weather: { ...MILD, avgTempMaxC: 38 },
    });
    const without = recommendTasks_1({
      stageNameKo: "결구기",
      weather: null,
    });

    expect(withWeather).toEqual(without);
  });
});

describe("recommendTasks_2 — 단계 × 기상", () => {
  it("더우면 기상 작업이 단계 작업보다 앞에 온다", () => {
    const tasks = recommendTasks_2({
      stageNameKo: "결구기",
      weather: { ...MILD, avgTempMaxC: 35 },
    });

    expect(tasks[0].id).toBe("weather-heat");
    expect(tasks.map((t) => t.id)).toContain("stage-bulk-water");
  });

  it("비가 많으면 물길을 터라고 한다", () => {
    const ids = recommendTasks_2({
      stageNameKo: "생육기",
      weather: { ...MILD, rainfallMm: 120 },
    }).map((t) => t.id);

    expect(ids).toContain("weather-wet");
  });

  it("비가 거의 없으면 한 번에 충분히 주라고 한다", () => {
    const ids = recommendTasks_2({
      stageNameKo: "생육기",
      weather: { ...MILD, rainfallMm: 2 },
    }).map((t) => t.id);

    expect(ids).toContain("weather-dry");
  });

  it("강수량을 모르면 물 관련 작업을 내지 않는다", () => {
    const ids = recommendTasks_2({
      stageNameKo: "생육기",
      weather: { ...MILD, rainfallMm: null },
    }).map((t) => t.id);

    expect(ids).not.toContain("weather-wet");
    expect(ids).not.toContain("weather-dry");
  });

  it("관측이 사흘 미만이면 기상 조건을 건너뛴다", () => {
    const tasks = recommendTasks_2({
      stageNameKo: "결구기",
      weather: { days: 2, avgTempMaxC: 38, avgTempMinC: 28, rainfallMm: 0 },
    });

    expect(tasks.every((t) => !t.id.startsWith("weather-"))).toBe(true);
  });
});

describe("두 변형은 같은 자리에 꽂힌다", () => {
  it("기상이 없으면 답이 같다", () => {
    const input = { stageNameKo: "개화기", weather: null };

    expect(recommendTasks_1(input)).toEqual(recommendTasks_2(input));
  });
});
