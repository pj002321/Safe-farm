import { describe, expect, it } from "vitest";
import {
  accumulateGdd,
  dailyGdd,
  daysToTarget,
  progressRatio,
  recentDailyGdd,
} from "./gdd";

/** 배추 기준온도. CABBAGE 상수가 생기기 전까지 여기서만 쓴다. */
const BASE = 5;

/**
 * 계산 자체를 확인할 최소 픽스처.
 *
 * 리포트 데모 데이터(`features/report/domain/observations.ts`)를 끌어오지 않는다.
 * shared 가 features 를 import 하면 의존 방향이 뒤집히고, 데모 숫자가 바뀔 때마다
 * 이 파일이 같이 깨진다. 그쪽 숫자의 회귀는 `reportNumbers.test.ts` 가 지킨다.
 */
const ROWS = [
  { date: "09-11", tempMinC: 14.0, tempMaxC: 27.1 },
  { date: "09-12", tempMinC: 15.1, tempMaxC: 28.1 },
  { date: "09-13", tempMinC: 15.0, tempMaxC: 28.8 },
] as const;

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

describe("accumulateGdd", () => {
  it("기준일 이전 관측은 빼고 더한다", () => {
    // 09-12 부터. 09-11 이 섞이면 심기도 전의 열을 세는 꼴이 된다.
    const from12 = accumulateGdd(ROWS, "09-12", BASE);
    const all = accumulateGdd(ROWS, "09-11", BASE);
    expect(from12).toBe(33.5);
    expect(all).toBeGreaterThan(from12);
  });

  it("기준일이 관측 뒤면 0 — 아직 심지 않은 밭", () => {
    expect(accumulateGdd(ROWS, "09-20", BASE)).toBe(0);
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
    expect(recentDailyGdd(ROWS, 7, BASE)).toBe(recentDailyGdd(ROWS, 3, BASE));
  });
});
