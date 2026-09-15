import { describe, expect, it } from "vitest";
import {
  assessPace,
  buildDeficits,
  buildStrengths,
  type GrowthObservation,
} from "./growthNotes";
import { CROP_CALENDARS } from "./growthStage";

/**
 * 판정 규칙의 임계값만 직접 고정한다. 문장 조립 결과는 growthReport.test.ts 가 본다.
 */

const lettuce = CROP_CALENDARS.lettuce;

/** 상추 표준 범위 한가운데. 각 테스트가 한 값씩만 바꿔 쓴다. */
const neutral: GrowthObservation = {
  cropId: "lettuce",
  daysSincePlanting: 20,
  recentAvgTempC: 18,
  recentRainMm: 25,
  sunshineHours: 6,
  forecastMinTempC: 12,
  forecastMaxTempC: 22,
  forecastRainMm: 20,
};

describe("assessPace", () => {
  it("적정 범위 안이면 편차 0, 표준이다", () => {
    for (const t of [15, 18, 22]) {
      expect(assessPace(lettuce, t)).toEqual({
        pace: "onTrack",
        paceDeltaDays: 0,
      });
    }
  });

  it("편차 1일 이하는 여전히 표준으로 본다", () => {
    // 23도 → 상한 초과 1도 → 0.8일 → 반올림 1일
    expect(assessPace(lettuce, 23)).toEqual({
      pace: "onTrack",
      paceDeltaDays: 1,
    });
  });

  it("범위를 넘으면 빠름, 못 미치면 느림", () => {
    expect(assessPace(lettuce, 24).pace).toBe("ahead");
    expect(assessPace(lettuce, 12).pace).toBe("behind");
  });

  it("극단적인 기온에서도 편차가 ±7일을 넘지 않는다", () => {
    expect(assessPace(lettuce, 45).paceDeltaDays).toBe(7);
    expect(assessPace(lettuce, -30).paceDeltaDays).toBe(-7);
  });

  it("값이 없어(NaN) 들어와도 표준으로 떨어진다", () => {
    expect(assessPace(lettuce, Number.NaN).pace).toBe("onTrack");
  });
});

describe("buildDeficits", () => {
  it("표준 안이면 부족한 점이 없다", () => {
    expect(buildDeficits(lettuce, neutral)).toEqual([]);
  });

  it("강수는 하한 미만이면 가뭄, 상한 초과면 과습이다 (경계는 정상)", () => {
    const at = (mm: number) =>
      buildDeficits(lettuce, { ...neutral, recentRainMm: mm }).map((n) => n.id);
    expect(at(15)).toEqual([]);
    expect(at(35)).toEqual([]);
    expect(at(14.9)).toEqual(["rain-short"]);
    expect(at(35.1)).toEqual(["rain-excess"]);
  });

  it("냉해 임계 아래로 떨어진 저온은 caution 이 아니라 unsuitable 이다", () => {
    const mild = buildDeficits(lettuce, { ...neutral, recentAvgTempC: 10 });
    expect(mild.find((n) => n.id === "temp-low")?.tone).toBe("caution");

    const severe = buildDeficits(lettuce, { ...neutral, recentAvgTempC: 1 });
    expect(severe.find((n) => n.id === "temp-low")?.tone).toBe("unsuitable");
  });

  it("일조가 3.5시간 아래면 웃자람을 경고한다", () => {
    expect(
      buildDeficits(lettuce, { ...neutral, sunshineHours: 3.4 }).some(
        (n) => n.id === "sun-short",
      ),
    ).toBe(true);
    expect(
      buildDeficits(lettuce, { ...neutral, sunshineHours: 3.5 }).some(
        (n) => n.id === "sun-short",
      ),
    ).toBe(false);
  });
});

describe("buildStrengths", () => {
  it("조건이 모두 좋으면 해당 항목을 전부 담는다", () => {
    const ids = buildStrengths(lettuce, neutral, "onTrack").map((n) => n.id);
    expect(ids).toContain("temp-ok");
    expect(ids).toContain("rain-ok");
    expect(ids).toContain("sun-ok");
    expect(ids).toContain("pace-ontrack");
    expect(ids).toContain("schedule-ok");
  });

  it("느리게 자라는 중이면 속도는 강점에 넣지 않는다", () => {
    const ids = buildStrengths(lettuce, neutral, "behind").map((n) => n.id);
    expect(ids).not.toContain("pace-ontrack");
    expect(ids).not.toContain("pace-ahead");
  });
});
