import { describe, expect, it } from "vitest";
import {
  type CropProfile,
  rankCrops,
  scoreSuitability,
  type WeatherWindow,
} from "./suitability";

/**
 * 이 프로젝트에서 TDD를 하는 유일한 자리.
 * 경계값(범위의 끝, 범위 밖 직후)을 먼저 고정하고 구현을 맞춘다.
 */

const tomato: CropProfile = {
  id: "tomato",
  nameKo: "토마토",
  tempRangeC: [18, 27],
  rainfallRangeMm: [40, 120],
  minSunshineHours: 6,
};

const ideal: WeatherWindow = { avgTempC: 22, rainfallMm: 80, sunshineHours: 8 };

describe("scoreSuitability", () => {
  it("모든 조건이 범위 안이면 만점이고 위험이 없다", () => {
    const r = scoreSuitability(tomato, ideal);
    expect(r.score).toBe(100);
    expect(r.grade).toBe("good");
    expect(r.risks).toEqual([]);
  });

  it("범위의 경계값은 포함이다 (이탈로 치지 않는다)", () => {
    for (const w of [
      { avgTempC: 18, rainfallMm: 40, sunshineHours: 6 },
      { avgTempC: 27, rainfallMm: 120, sunshineHours: 6 },
    ] satisfies WeatherWindow[]) {
      const r = scoreSuitability(tomato, w);
      expect(r.score).toBe(100);
      expect(r.risks).toEqual([]);
    }
  });

  it("하한 미만이면 cold, 상한 초과면 heat 위험을 낸다", () => {
    expect(
      scoreSuitability(tomato, { ...ideal, avgTempC: 10 }).risks[0].kind,
    ).toBe("cold");
    expect(
      scoreSuitability(tomato, { ...ideal, avgTempC: 35 }).risks[0].kind,
    ).toBe("heat");
  });

  it("강수 부족은 drought, 과다는 flood", () => {
    expect(
      scoreSuitability(tomato, { ...ideal, rainfallMm: 0 }).risks[0].kind,
    ).toBe("drought");
    expect(
      scoreSuitability(tomato, { ...ideal, rainfallMm: 400 }).risks[0].kind,
    ).toBe("flood");
  });

  it("일조는 하한만 본다 — 넘쳐도 위험이 아니다", () => {
    const r = scoreSuitability(tomato, { ...ideal, sunshineHours: 14 });
    expect(r.risks).toEqual([]);
  });

  it("일조 부족은 부족분 비율만큼 감점한다", () => {
    // 6시간 요구에 3시간 → lightDev 0.5 → 감점 10점
    const r = scoreSuitability(tomato, { ...ideal, sunshineHours: 3 });
    expect(r.score).toBe(90);
    expect(r.risks).toEqual([{ kind: "lowLight", severity: 0.5 }]);
  });

  it("이탈이 아무리 커도 점수는 0 밑으로 내려가지 않는다", () => {
    const r = scoreSuitability(tomato, {
      avgTempC: -50,
      rainfallMm: 9999,
      sunshineHours: 0,
    });
    expect(r.score).toBe(0);
    expect(r.grade).toBe("unsuitable");
  });

  it("등급 경계: 80이상 good, 50이상 caution, 미만 unsuitable", () => {
    // tempRange span=9. 기온이 상한+1.8 이면 dev=0.2 → 감점 10 → 90
    expect(scoreSuitability(tomato, { ...ideal, avgTempC: 28.8 }).grade).toBe(
      "good",
    );
    // dev=0.5 → 감점 25 → 75
    expect(scoreSuitability(tomato, { ...ideal, avgTempC: 31.5 }).grade).toBe(
      "caution",
    );
    // dev=1(최대) → 감점 50 → 50
    expect(scoreSuitability(tomato, { ...ideal, avgTempC: 99 }).grade).toBe(
      "caution",
    );
  });

  it("요구 범위가 단일값이면 벗어난 즉시 최대 이탈로 본다", () => {
    const picky: CropProfile = { ...tomato, id: "picky", tempRangeC: [20, 20] };
    const r = scoreSuitability(picky, { ...ideal, avgTempC: 21 });
    expect(r.risks[0].severity).toBe(1);
  });
});

describe("rankCrops", () => {
  const rice: CropProfile = {
    id: "rice",
    nameKo: "벼",
    tempRangeC: [20, 30],
    rainfallRangeMm: [150, 400],
    minSunshineHours: 5,
  };

  it("점수 내림차순으로 정렬한다", () => {
    const ranked = rankCrops([rice, tomato], ideal);
    expect(ranked.map((r) => r.cropId)).toEqual(["tomato", "rice"]);
  });

  it("동점이면 cropId 사전순으로 안정 정렬한다", () => {
    const twin: CropProfile = { ...tomato, id: "aaa" };
    const ranked = rankCrops([tomato, twin], ideal);
    expect(ranked.map((r) => r.cropId)).toEqual(["aaa", "tomato"]);
  });

  it("빈 후보 목록은 빈 결과를 낸다", () => {
    expect(rankCrops([], ideal)).toEqual([]);
  });
});
