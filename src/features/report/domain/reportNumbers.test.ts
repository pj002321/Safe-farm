import { describe, expect, it } from "vitest";
import {
  accumulateGdd,
  daysToTarget,
  progressRatio,
  recentDailyGdd,
} from "@/shared/growth/gdd";
import { GDD_BEFORE_WINDOW, RECENT_DAYS, SOWING_DATE } from "./observations";

/** 배추 기준온도·상한온도. 확정표 §B-2 (호냉성 25℃). */
const BASE = 5;
const UPPER = 25;
/** 농진청 가을배추 작형 기준 총 적산온도와 결구 시작점. */
const TOTAL_TARGET = 797;
const HEADING_TARGET = 505;

/**
 * 계산이 **조용히** 달라지는 것이 가장 큰 사고다. 이 리포트는 "근거를 그대로
 * 댈 수 있다"가 유일한 자산이라, 값이 바뀌면 왜 바뀌었는지가 여기 남아야 한다.
 *
 * 계산 함수 자체의 테스트는 `shared/growth/gdd.test.ts` 에 있다. 이 파일은 그
 * 함수에 **리포트 데모 데이터를 넣었을 때 나오는 숫자**만 지킨다.
 *
 * ⚠ 2026-09-16 에 값이 바뀌었다. 출처 PoC(safefarm_nafarmer_demo.html)는
 *   상한 없는 식으로 찍은 숫자였다. 배추 upper_temp 25℃ 를 넣으면서 바뀌었다.
 *
 *     248.9 → 226.3   14일 누적
 *     384.2 → 361.6   창 이전(135.3) 포함
 *      15.8 →  14.6   최근 7일 평균
 *      48.2% → 45.4%  진행률 ·  결구까지 8일 → 10일
 *
 *   14일 중 **13일이 25℃를 넘었다.** 그만큼이 "열은 쌓였는데 배추는 안 자란"
 *   구간이었다. PoC 숫자가 그 몫까지 세고 있었던 것이다.
 */
describe("지금 식으로 계산한 리포트 숫자", () => {
  const observed = accumulateGdd(RECENT_DAYS, SOWING_DATE, BASE, UPPER);
  const total = Math.round((observed + GDD_BEFORE_WINDOW) * 10) / 10;
  const perDay = recentDailyGdd(RECENT_DAYS, 7, BASE, UPPER);

  it("관측 14일 누적 = 226.3 GDD", () => {
    expect(observed).toBe(226.3);
  });

  it("창 이전 누적을 더하면 361.6 GDD", () => {
    expect(total).toBe(361.6);
  });

  it("최근 7일 평균 = 14.6 GDD/일", () => {
    expect(perDay).toBe(14.6);
  });

  it("결구(505)까지 약 10일", () => {
    expect(daysToTarget(total, perDay, HEADING_TARGET)).toBe(10);
  });

  it("전체 진행률 45.4%", () => {
    expect(progressRatio(total, TOTAL_TARGET) * 100).toBeCloseTo(45.4, 1);
  });
});
