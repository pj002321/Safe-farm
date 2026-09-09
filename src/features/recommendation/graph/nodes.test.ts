import { END } from "@langchain/langgraph";
import { describe, expect, it } from "vitest";
import {
  makeCollectWeatherNode,
  rankCandidatesNode,
  routeAfterRank,
  routeAfterWeather,
} from "./nodes";
import type { RecommendationStateType } from "./state";

/**
 * 조건부 엣지는 순수 함수라 테스트 가성비가 가장 높다.
 * 분기 하나당 테스트 하나 — 이 표가 곧 그래프의 명세다.
 */

const base: RecommendationStateType = {
  fieldId: "f1",
  weather: null,
  candidates: [],
  ranked: [],
  explanation: "",
  error: null,
};

const weather = { avgTempC: 22, rainfallMm: 80, sunshineHours: 8 };

describe("routeAfterWeather", () => {
  it("에러가 있으면 즉시 종료한다", () => {
    expect(routeAfterWeather({ ...base, error: "boom", weather })).toBe(END);
  });

  it("기상 데이터가 없으면 종료한다", () => {
    expect(routeAfterWeather(base)).toBe(END);
  });

  it("정상이면 후보 로딩으로 간다", () => {
    expect(routeAfterWeather({ ...base, weather })).toBe("loadCandidates");
  });
});

describe("routeAfterRank", () => {
  const ranked = [
    { cropId: "tomato", score: 90, grade: "good" as const, risks: [] },
  ];

  it("추천 결과가 비면 LLM을 부르지 않는다 (토큰 절약)", () => {
    expect(routeAfterRank({ ...base, ranked: [] })).toBe(END);
  });

  it("결과가 있으면 설명 노드로 간다", () => {
    expect(routeAfterRank({ ...base, ranked })).toBe("explain");
  });
});

describe("makeCollectWeatherNode", () => {
  it("주입된 fetcher의 결과를 상태에 넣는다", async () => {
    const node = makeCollectWeatherNode(async () => weather);
    expect(await node(base)).toEqual({ weather });
  });

  it("fetcher가 던지면 사용자에게 보여줄 error로 변환한다 (증상을 삼키지 않음)", async () => {
    const node = makeCollectWeatherNode(async () => {
      throw new Error("timeout");
    });
    const result = await node(base);
    expect(result.error).toContain("timeout");
    expect(result.weather).toBeUndefined();
  });
});

describe("rankCandidatesNode", () => {
  it("기상 데이터가 없으면 계산하지 않고 error를 낸다", async () => {
    expect(await rankCandidatesNode(base)).toEqual({
      error: "기상 데이터가 없어 점수를 낼 수 없습니다.",
    });
  });

  it("도메인 함수 결과를 그대로 상태에 담는다", async () => {
    const result = await rankCandidatesNode({
      ...base,
      weather,
      candidates: [
        {
          id: "tomato",
          nameKo: "토마토",
          tempRangeC: [18, 27],
          rainfallRangeMm: [40, 120],
          minSunshineHours: 6,
        },
      ],
    });
    expect(result.ranked).toEqual([
      { cropId: "tomato", score: 100, grade: "good", risks: [] },
    ]);
  });
});
