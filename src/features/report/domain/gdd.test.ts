import { describe, expect, it } from "vitest";
import {
  accumulateGdd,
  dailyGdd,
  daysToTarget,
  progressRatio,
  recentDailyGdd,
} from "./gdd";
import { GDD_BEFORE_WINDOW, RECENT_DAYS, SOWING_DATE } from "./observations";

/** 배추 기준온도. CABBAGE 상수가 생기기 전까지 여기서만 쓴다. */
const BASE = 5;
/** 농진청 가을배추 작형 기준 총 적산온도와 결구 시작점. */
const TOTAL_TARGET = 797;
const HEADING_TARGET = 505;

describe("dailyGdd", () => {
  it("평균기온에서 기준온도를 뺀다", () => {
    expect(dailyGdd(28.8, 15.0, 5)).toBeCloseTo(16.9, 5);
  });

  it("기준온도 아래면 0 이다 — 음수를 더해 성장을 되돌리지 않는다", () => {
    // 이걸 놓치면 추운 날이 지난 성장을 깎아 누적값이 실제보다 작아지고,
    // "며칠 남았나"가 통째로 늦게 나온다.
    expect(dailyGdd(4, 0, 5)).toBe(0);
    expect(dailyGdd(-2, -10, 5)).toBe(0);
  });

  it("기준온도와 같으면 0", () => {
    expect(dailyGdd(5, 5, 5)).toBe(0);
  });
});

/**
 * 출처 PoC(safefarm_nafarmer_demo.html)가 화면에 찍은 값과 한 자리도 달라지면
 * 안 된다. 이 리포트는 "근거를 그대로 댈 수 있다"가 유일한 자산이라,
 * 계산이 조용히 달라지는 것이 가장 큰 사고다.
 */
describe("출처 PoC 의 숫자를 그대로 재현한다", () => {
  const observed = accumulateGdd(RECENT_DAYS, SOWING_DATE, BASE);
  const total = Math.round((observed + GDD_BEFORE_WINDOW) * 10) / 10;
  const perDay = recentDailyGdd(RECENT_DAYS, 7, BASE);

  it("관측 14일 누적 = 248.9 GDD", () => {
    expect(observed).toBe(248.9);
  });

  it("창 이전 누적을 더하면 384.2 GDD", () => {
    expect(total).toBe(384.2);
  });

  it("최근 7일 평균 = 15.8 GDD/일", () => {
    expect(perDay).toBe(15.8);
  });

  it("결구(505)까지 약 8일", () => {
    expect(daysToTarget(total, perDay, HEADING_TARGET)).toBe(8);
  });

  it("전체 진행률 48.2%", () => {
    expect(progressRatio(total, TOTAL_TARGET) * 100).toBeCloseTo(48.2, 1);
  });
});

describe("daysToTarget", () => {
  it("이미 넘겼으면 0", () => {
    expect(daysToTarget(600, 15, 505)).toBe(0);
  });

  it("기온이 기준 아래로만 이어지면 null — 추정하지 않는다", () => {
    // 0 으로 나누면 Infinity 가 화면에 나간다. 임의의 큰 수로 때우면
    // 사용자가 그 숫자를 믿어버리므로, 모른다고 말하게 한다.
    expect(daysToTarget(100, 0, 505)).toBeNull();
    expect(daysToTarget(100, -3, 505)).toBeNull();
  });
});

describe("progressRatio", () => {
  it("0~1 을 벗어나지 않는다 — 게이지가 칸을 삐져나가지 않게", () => {
    expect(progressRatio(900, 797)).toBe(1);
    expect(progressRatio(-50, 797)).toBe(0);
  });

  it("목표가 0 이하면 0 — 나눗셈을 시도하지 않는다", () => {
    expect(progressRatio(100, 0)).toBe(0);
  });
});

describe("recentDailyGdd", () => {
  it("빈 배열이면 0 — NaN 이 화면에 나가지 않게", () => {
    expect(recentDailyGdd([], 7, 5)).toBe(0);
  });

  it("요청한 일수보다 데이터가 적으면 있는 만큼만 평균낸다", () => {
    const rows = RECENT_DAYS.slice(-3);
    expect(recentDailyGdd(rows, 7, BASE)).toBe(recentDailyGdd(rows, 3, BASE));
  });
});
