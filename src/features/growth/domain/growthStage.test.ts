import { describe, expect, it } from "vitest";
import {
  CROP_CALENDARS,
  overallProgress,
  stageAt,
  stageProgress,
} from "./growthStage";

/**
 * 경계값을 먼저 고정한다. 단계 판정이 하루 어긋나면 "오늘 수확하세요"가
 * 이틀 일찍 나간다 — 리포트에서 가장 비싼 실수다.
 */

const lettuce = CROP_CALENDARS.lettuce;

describe("stageAt", () => {
  it("0일째는 첫 단계다", () => {
    expect(stageAt(lettuce, 0).id).toBe("germination");
  });

  it("startDay 는 포함이다 — 그날부터 다음 단계로 넘어간다", () => {
    expect(stageAt(lettuce, 20).id).toBe("seedling");
    expect(stageAt(lettuce, 21).id).toBe("leafGrowth");
    expect(stageAt(lettuce, 31).id).toBe("leafGrowth");
    expect(stageAt(lettuce, 32).id).toBe("harvest");
  });

  it("마지막 날과 그 이후는 마지막 단계를 낸다", () => {
    expect(stageAt(lettuce, 44).id).toBe("harvest");
    expect(stageAt(lettuce, 45).id).toBe("bolting");
    expect(stageAt(lettuce, 9999).id).toBe("bolting");
  });

  it("심기 전(음수)이면 첫 단계로 잘라낸다", () => {
    expect(stageAt(lettuce, -1).id).toBe("germination");
    expect(stageAt(lettuce, -100).id).toBe("germination");
  });

  it("숫자가 아닌 입력도 화면을 비우지 않고 첫 단계로 떨어진다", () => {
    expect(stageAt(lettuce, Number.NaN).id).toBe("germination");
  });
});

describe("stageProgress", () => {
  it("단계 시작일은 0, 다음 단계 직전은 1에 가깝다", () => {
    expect(stageProgress(lettuce, 21)).toBe(0);
    expect(stageProgress(lettuce, 26)).toBeCloseTo(5 / 11, 5);
  });

  it("폭이 0인 마지막 단계(추대기)는 1을 낸다", () => {
    expect(stageProgress(lettuce, 45)).toBe(1);
  });

  it("어떤 입력에도 0~1 을 벗어나지 않는다", () => {
    for (const crop of Object.values(CROP_CALENDARS)) {
      for (const day of [-500, -1, 0, 1, 7, 45, 110, 150, 9999]) {
        const p = stageProgress(crop, day);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("overallProgress", () => {
  it("전체 기간 대비 비율이고 0~1 로 잘린다", () => {
    expect(overallProgress(lettuce, 0)).toBe(0);
    expect(overallProgress(lettuce, 45)).toBe(1);
    expect(overallProgress(lettuce, -10)).toBe(0);
    expect(overallProgress(lettuce, 9999)).toBe(1);
    expect(overallProgress(lettuce, 32)).toBeCloseTo(32 / 45, 5);
  });
});

/**
 * 데이터 불변식. 작물을 추가하다가 stages 순서를 흐트러뜨리면
 * stageAt 이 조용히 엉뚱한 단계를 내므로, 여기서 먼저 막는다.
 */
describe("CROP_CALENDARS 불변식", () => {
  const entries = Object.entries(CROP_CALENDARS);

  it("키와 cropId 가 일치한다", () => {
    for (const [key, crop] of entries) expect(crop.cropId).toBe(key);
  });

  it.each(entries)("%s 의 단계 정의가 올바르다", (_key, crop) => {
    expect(crop.stages.length).toBeGreaterThan(0);
    expect(crop.stages[0].startDay).toBe(0);
    expect(crop.totalDays).toBeGreaterThan(0);

    const days = crop.stages.map((s) => s.startDay);
    expect(days).toEqual([...days].sort((a, b) => a - b));
    expect(days[days.length - 1]).toBeLessThanOrEqual(crop.totalDays);
  });

  it.each(entries)("%s 의 적정 범위와 위험 임계가 뒤집히지 않았다", (_k, c) => {
    expect(c.idealTempC[0]).toBeLessThan(c.idealTempC[1]);
    expect(c.idealWeeklyRainMm[0]).toBeLessThan(c.idealWeeklyRainMm[1]);
    expect(c.frostRiskBelowC).toBeLessThan(c.heatRiskAboveC);
  });
});
