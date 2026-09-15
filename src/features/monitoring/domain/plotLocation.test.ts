import { describe, expect, it } from "vitest";
import {
  isInKorea,
  PLOT_LOCATION_MESSAGE,
  validatePlotLocation,
} from "./plotLocation";

/**
 * 경계 상자는 한 번 잘못 잡으면 경계 섬의 밭이 조용히 거부된다. 화면에서는
 * "국외입니다" 한 줄만 보여 원인을 찾기 어려우므로 여기서 네 귀퉁이를 못 박는다.
 */

describe("isInKorea", () => {
  it("내륙 농업지대를 통과시킨다", () => {
    expect(isInKorea({ lat: 36.41, lon: 128.16 })).toBe(true); // 상주
    expect(isInKorea({ lat: 35.8, lon: 126.89 })).toBe(true); // 김제
  });

  it("경계 섬을 잘라내지 않는다", () => {
    expect(isInKorea({ lat: 33.11, lon: 126.27 })).toBe(true); // 마라도
    expect(isInKorea({ lat: 37.24, lon: 131.86 })).toBe(true); // 독도
    expect(isInKorea({ lat: 37.96, lon: 124.71 })).toBe(true); // 백령도
  });

  it("이웃 나라를 막는다", () => {
    expect(isInKorea({ lat: 35.68, lon: 139.69 })).toBe(false); // 도쿄
    expect(isInKorea({ lat: 39.9, lon: 116.4 })).toBe(false); // 베이징
  });

  /**
   * 사각형 하나로 판정하던 판이 여기서 뚫렸다. 지도에서 거제도 옆에 보여
   * 오클릭이 실제로 났다 — 회귀를 막으려고 좌표를 그대로 박아 둔다.
   */
  it("대마도와 규슈 북부를 막는다", () => {
    expect(isInKorea({ lat: 34.403, lon: 129.332 })).toBe(false); // 대마도 중부
    expect(isInKorea({ lat: 34.7, lon: 129.45 })).toBe(false); // 대마도 북단
    expect(isInKorea({ lat: 33.59, lon: 130.4 })).toBe(false); // 후쿠오카
    expect(isInKorea({ lat: 33.79, lon: 129.72 })).toBe(false); // 이키섬
  });

  it("대마도 바로 옆 국내 지역은 통과시킨다", () => {
    expect(isInKorea({ lat: 34.88, lon: 128.62 })).toBe(true); // 거제도
    expect(isInKorea({ lat: 35.18, lon: 129.08 })).toBe(true); // 부산
    expect(isInKorea({ lat: 35.54, lon: 129.31 })).toBe(true); // 울산
    expect(isInKorea({ lat: 36.02, lon: 129.37 })).toBe(true); // 포항
  });

  it("경계값은 포함이다", () => {
    expect(isInKorea({ lat: 33.0, lon: 126.5 })).toBe(true); // ② 남쪽 끝
    expect(isInKorea({ lat: 32.99, lon: 126.5 })).toBe(false);
    expect(isInKorea({ lat: 35.0, lon: 129.5 })).toBe(true); // ③ 남쪽 끝
    expect(isInKorea({ lat: 34.99, lon: 129.5 })).toBe(false);
  });
});

describe("validatePlotLocation", () => {
  it("정상 좌표는 null 을 돌려준다", () => {
    expect(validatePlotLocation({ lat: 36.41, lon: 128.16 })).toBeNull();
  });

  it("아직 찍지 않았으면 missing", () => {
    expect(validatePlotLocation(null)).toBe("missing");
  });

  it("NaN 은 outside-korea 가 아니라 not-finite 로 구분한다", () => {
    expect(validatePlotLocation({ lat: Number.NaN, lon: 128.16 })).toBe(
      "not-finite",
    );
    expect(validatePlotLocation({ lat: 36.41, lon: Number.NaN })).toBe(
      "not-finite",
    );
  });

  it("국외는 outside-korea", () => {
    expect(validatePlotLocation({ lat: 35.68, lon: 139.69 })).toBe(
      "outside-korea",
    );
  });
});

describe("PLOT_LOCATION_MESSAGE", () => {
  it("모든 오류 종류에 문구가 있다", () => {
    for (const issue of ["missing", "not-finite", "outside-korea"] as const) {
      expect(PLOT_LOCATION_MESSAGE[issue].length).toBeGreaterThan(0);
    }
  });
});
