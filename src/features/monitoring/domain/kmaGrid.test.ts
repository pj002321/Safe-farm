import { describe, expect, it } from "vitest";
import { toKmaGrid } from "./kmaGrid";

/**
 * 격자가 어긋나면 등록은 성공하는데 기상 조회만 남의 동네 값을 가져온다.
 * 화면에는 아무 오류도 안 뜨므로 여기서 못 박는다.
 */

describe("toKmaGrid", () => {
  /** 기상청 공식 문서에 실린 값. 상수를 잘못 옮기면 여기가 먼저 깨진다. */
  it("서울 종로는 nx 60 · ny 127 이다", () => {
    expect(toKmaGrid({ lat: 37.5665, lon: 126.978 })).toEqual({
      nx: 60,
      ny: 127,
    });
  });

  it("관측 지점들의 격자가 고정돼 있다", () => {
    expect(toKmaGrid({ lat: 36.4109, lon: 128.159 })).toEqual({
      nx: 81,
      ny: 102,
    }); // 상주
    expect(toKmaGrid({ lat: 35.8, lon: 126.89 })).toEqual({ nx: 59, ny: 88 }); // 김제
    expect(toKmaGrid({ lat: 34.57, lon: 126.6 })).toEqual({ nx: 54, ny: 61 }); // 해남
  });

  it("남북·동서 끝도 양수 격자로 떨어진다", () => {
    const jeju = toKmaGrid({ lat: 33.4996, lon: 126.5312 });
    const dokdo = toKmaGrid({ lat: 37.2428, lon: 131.8664 });

    for (const grid of [jeju, dokdo]) {
      expect(grid.nx).toBeGreaterThan(0);
      expect(grid.ny).toBeGreaterThan(0);
    }

    expect(jeju).toEqual({ nx: 53, ny: 38 });
    expect(dokdo).toEqual({ nx: 144, ny: 123 });
  });

  it("항상 정수를 돌려준다", () => {
    const grid = toKmaGrid({ lat: 36.12345, lon: 128.54321 });
    expect(Number.isInteger(grid.nx)).toBe(true);
    expect(Number.isInteger(grid.ny)).toBe(true);
  });
});
