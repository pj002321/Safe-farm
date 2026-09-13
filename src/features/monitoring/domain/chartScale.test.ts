import { describe, expect, it } from "vitest";
import {
  axisTicks,
  type ChartBox,
  createScale,
  dateToNumber,
  toPolylinePoints,
} from "./chartScale";

/**
 * ---------------------------------------------
 * [Feature]: 차트 좌표 계산 회귀 테스트
 *
 * [Description]
 * - 이 파일이 막으려는 건 "선이 통째로 안 보이는" 버그다. NaN 좌표는 SVG 가
 *   오류를 내지 않고 조용히 아무것도 안 그리므로 화면으로는 원인을 못 찾는다.
 * - 그래서 경계(점 하나, lo === hi, 빈 입력)를 전부 고정한다.
 * ---------------------------------------------
 */
const BOX: ChartBox = {
  width: 440,
  height: 180,
  padding: { top: 12, right: 12, bottom: 26, left: 36 },
};

const inBox = (value: number, lo: number, hi: number) =>
  Number.isFinite(value) && value >= lo - 1e-9 && value <= hi + 1e-9;

describe("dateToNumber", () => {
  it("같은 달은 일자 순으로, 다음 달은 더 큰 값으로 간다", () => {
    expect(dateToNumber("04-03")).toBeLessThan(dateToNumber("04-05"));
    expect(dateToNumber("04-30")).toBeLessThan(dateToNumber("05-01"));
  });

  it("형식이 어긋나면 NaN 대신 던진다", () => {
    expect(() => dateToNumber("2026-04-03")).toThrow(TypeError);
    expect(() => dateToNumber("4-3")).toThrow(TypeError);
    expect(() => dateToNumber("")).toThrow(TypeError);
  });
});

describe("createScale", () => {
  const dates = ["04-03", "06-15", "09-12"];

  it("도메인 안의 값은 그리는 영역 안에 들어온다", () => {
    const scale = createScale(dates, { lo: 0.2, hi: 0.85 }, BOX);
    for (const date of dates) {
      expect(inBox(scale.x(date), 36, 440 - 12)).toBe(true);
    }
    for (const value of [0.2, 0.5, 0.85]) {
      expect(inBox(scale.y(value), 12, 180 - 26)).toBe(true);
    }
  });

  it("y 는 값이 클수록 위로(작은 좌표로) 간다", () => {
    const scale = createScale(dates, { lo: 0, hi: 1 }, BOX);
    expect(scale.y(1)).toBeLessThan(scale.y(0));
  });

  it("점이 하나뿐이어도 NaN 이 나오지 않고 가운데로 간다", () => {
    const scale = createScale(["05-01"], { lo: 0.2, hi: 0.85 }, BOX);
    expect(scale.x("05-01")).toBe(36 + (440 - 36 - 12) / 2);
  });

  it("lo === hi 여도 0으로 나누지 않는다", () => {
    const scale = createScale(dates, { lo: 0.5, hi: 0.5 }, BOX);
    expect(scale.y(0.5)).toBe(12 + (180 - 12 - 26) / 2);
  });

  it("날짜가 하나도 없어도 유한한 값을 준다", () => {
    const scale = createScale([], { lo: 0, hi: 1 }, BOX);
    expect(Number.isFinite(scale.x("05-01"))).toBe(true);
  });

  it("여백이 상자보다 커도 음수 폭으로 뒤집히지 않는다", () => {
    const narrow: ChartBox = {
      width: 20,
      height: 20,
      padding: { top: 30, right: 30, bottom: 30, left: 30 },
    };
    const scale = createScale(dates, { lo: 0, hi: 1 }, narrow);
    expect(scale.x("09-12")).toBe(30);
  });
});

describe("toPolylinePoints", () => {
  const scale = createScale(["04-03", "09-12"], { lo: 0, hi: 1 }, BOX);

  it("좌표 쌍을 공백으로 잇는다", () => {
    const points = toPolylinePoints(
      [
        { date: "04-03", value: 0.2 },
        { date: "09-12", value: 0.8 },
      ],
      scale,
    );
    expect(points.split(" ")).toHaveLength(2);
    expect(points).not.toContain("NaN");
  });

  it("빈 입력은 빈 문자열이다", () => {
    expect(toPolylinePoints([], scale)).toBe("");
  });

  it("값이 결측이어도 나머지 점은 살린다", () => {
    const points = toPolylinePoints(
      [
        { date: "04-03", value: Number.NaN },
        { date: "09-12", value: 0.5 },
      ],
      scale,
    );
    expect(points).not.toContain("NaN");
    expect(points.split(" ")).toHaveLength(1);
  });
});

describe("axisTicks", () => {
  it("부동소수 쓰레기값을 내지 않는다", () => {
    expect(axisTicks(-0.2, 0.6, 0.2)).toEqual([-0.2, 0, 0.2, 0.4, 0.6]);
    expect(axisTicks(0.2, 0.85, 0.2)).toEqual([0.2, 0.4, 0.6, 0.8]);
  });

  it("-0 을 만들지 않는다", () => {
    expect(Object.is(axisTicks(-0.2, 0.2, 0.2)[1], 0)).toBe(true);
  });

  it("step 이 0 이하거나 범위가 뒤집히면 빈 배열", () => {
    expect(axisTicks(0, 1, 0)).toEqual([]);
    expect(axisTicks(0, 1, -0.1)).toEqual([]);
    expect(axisTicks(1, 0, 0.1)).toEqual([]);
  });

  it("lo === hi 면 눈금 하나", () => {
    expect(axisTicks(0.5, 0.5, 0.1)).toEqual([0.5]);
  });
});
