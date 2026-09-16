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
/** 배추 상한온도. 확정표 §B-2 (호냉성 25℃). */
const UPPER = 25;
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

  it("상한이 있으면 Tmax 를 거기서 자른다 — Modified", () => {
    // 옥수수 폭염일. 평균을 먼저 내고 자르면 20 이 나와 15% 부풀려진다.
    expect(dailyGdd(36, 24, 10, 30)).toBe(17);
  });

  it("상한이 있으면 Tmin 도 기준온도에서 자른다", () => {
    // 상추 봄날. 상한 25 에는 안 걸리지만 Tmin 2 → 4 로 올라가 7 이 된다.
    expect(dailyGdd(18, 2, 4, 25)).toBe(7);
  });

  it("상한이 없으면 Standard 다 — Tmin 을 자르지 않는다", () => {
    // 이 줄이 두 식을 가르는 자물쇠다. Tmin 클램프를 분기 밖으로 빼면
    // 여기서 7 이 나와 깨진다.
    expect(dailyGdd(18, 2, 4)).toBe(6);
  });
});

/**
 * 계산이 **조용히** 달라지는 것이 가장 큰 사고다. 이 리포트는 "근거를 그대로
 * 댈 수 있다"가 유일한 자산이라, 값이 바뀌면 왜 바뀌었는지가 여기 남아야 한다.
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
