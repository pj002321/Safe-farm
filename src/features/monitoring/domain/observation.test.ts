import { describe, expect, it } from "vitest";
import {
  GOKSEONG_PADDY,
  latestPoint,
  type ObservationSeries,
  SANGJU_SERIES,
  seriesRange,
} from "./observation";

/**
 * ---------------------------------------------
 * [Feature]: 관측 시계열 회귀 테스트
 *
 * [Description]
 * - 데이터를 옮겨 적는 작업이라 오타가 가장 큰 위험이다. 날짜 순서가 뒤집히면
 *   차트 선이 스스로를 가로지르고, 지수가 범위를 벗어나면 축 밖으로 나간다.
 *   둘 다 화면을 봐도 "좀 이상한데"에서 멈춘다. 그래서 성질로 고정한다.
 * - 곡성 계열의 하락은 이 페이지의 논지 자체다. 값이 뒤바뀌면 테스트가 막는다.
 * ---------------------------------------------
 */
const ALL_SERIES: readonly ObservationSeries[] = [
  ...SANGJU_SERIES,
  GOKSEONG_PADDY,
];

describe("관측 시계열", () => {
  it("상주는 논·밭·과수 세 계열이고 모두 비어 있지 않다", () => {
    expect(SANGJU_SERIES).toHaveLength(3);
    expect(SANGJU_SERIES.map((series) => series.plot)).toEqual([
      "paddy",
      "field",
      "orchard",
    ]);
    for (const series of ALL_SERIES) {
      expect(series.points.length).toBeGreaterThan(0);
    }
  });

  it("날짜가 오름차순이고 중복이 없다", () => {
    for (const series of ALL_SERIES) {
      const dates = series.points.map((point) => point.date);
      expect(dates).toEqual([...dates].sort());
      expect(new Set(dates).size).toBe(dates.length);
    }
  });

  it("NDVI·NDMI 가 -1 ~ 1 범위 안에 있다", () => {
    for (const series of ALL_SERIES) {
      for (const point of series.points) {
        expect(point.ndvi).toBeGreaterThanOrEqual(-1);
        expect(point.ndvi).toBeLessThanOrEqual(1);
        expect(point.ndmi).toBeGreaterThanOrEqual(-1);
        expect(point.ndmi).toBeLessThanOrEqual(1);
      }
    }
  });

  it("곡성 논은 모내기로 떨어지고, 상주 논은 떨어지지 않는다", () => {
    const first = GOKSEONG_PADDY.points[0];
    const last = latestPoint(GOKSEONG_PADDY);
    expect(last.ndvi).toBeLessThan(first.ndvi);

    const sangjuPaddy = SANGJU_SERIES[0];
    expect(latestPoint(sangjuPaddy).ndvi).toBeGreaterThan(
      sangjuPaddy.points[0].ndvi,
    );
  });
});

describe("seriesRange", () => {
  it("최소·최대를 실제 값에서 뽑는다", () => {
    const range = seriesRange(SANGJU_SERIES[0], "ndvi");
    expect(range.min).toBeCloseTo(0.257);
    expect(range.max).toBeCloseTo(0.728);
  });

  it("음수 NDMI 도 최소값으로 잡는다", () => {
    expect(seriesRange(SANGJU_SERIES[2], "ndmi").min).toBeLessThan(0);
  });

  it("빈 계열은 0으로 나누지 않도록 0~0 을 준다", () => {
    const empty: ObservationSeries = {
      plot: "field",
      nameKo: "빈 밭",
      elevationM: 0,
      points: [],
    };
    expect(seriesRange(empty, "ndvi")).toEqual({ min: 0, max: 0 });
  });
});

describe("latestPoint", () => {
  it("마지막 관측을 준다", () => {
    expect(latestPoint(SANGJU_SERIES[0]).date).toBe("09-12");
  });

  it("빈 계열은 조용히 넘기지 않고 던진다", () => {
    expect(() =>
      latestPoint({
        plot: "paddy",
        nameKo: "빈 논",
        elevationM: 0,
        points: [],
      }),
    ).toThrow();
  });
});
