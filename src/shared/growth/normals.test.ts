import { describe, expect, it } from "vitest";
import { foldMonthlyNormals, type NormalDay } from "./normals";

/** 한 달치 행을 같은 값으로 만든다. 평균이 그 값 그대로 나와야 한다. */
function month(m: number, max: number, min: number, days = 30): NormalDay[] {
  return Array.from({ length: days }, () => ({
    month: m,
    tempMaxC: max,
    tempMinC: min,
  }));
}

describe("foldMonthlyNormals", () => {
  it("월별 평균을 낸다", () => {
    const rows = [
      { month: 9, tempMaxC: 28, tempMinC: 20 },
      { month: 9, tempMaxC: 26, tempMinC: 18 },
    ];
    expect(foldMonthlyNormals(rows)).toEqual([
      { month: 9, tempMaxC: 27, tempMinC: 19 },
    ]);
  });

  it("월 오름차순으로 돌려준다", () => {
    const rows = [...month(12, 5, -3), ...month(3, 12, 2), ...month(7, 29, 22)];
    expect(foldMonthlyNormals(rows).map((row) => row.month)).toEqual([
      3, 7, 12,
    ]);
  });

  it("소수 한 자리로 자른다", () => {
    const rows = [
      { month: 5, tempMaxC: 23.34, tempMinC: 11.11 },
      { month: 5, tempMaxC: 23.35, tempMinC: 11.12 },
    ];
    expect(foldMonthlyNormals(rows)).toEqual([
      { month: 5, tempMaxC: 23.3, tempMinC: 11.1 },
    ]);
  });

  it("최고·최저 중 하나라도 없는 달은 뺀다", () => {
    const rows = [
      { month: 1, tempMaxC: 2, tempMinC: null },
      { month: 2, tempMaxC: 5, tempMinC: -1 },
    ];
    expect(foldMonthlyNormals(rows)).toEqual([
      { month: 2, tempMaxC: 5, tempMinC: -1 },
    ]);
  });

  it("빈 값을 0 으로 세지 않는다", () => {
    // null 이 평균의 분모에 들어가면 27 이 아니라 18 이 나온다.
    const rows = [
      { month: 9, tempMaxC: 28, tempMinC: 20 },
      { month: 9, tempMaxC: null, tempMinC: 18 },
      { month: 9, tempMaxC: 26, tempMinC: 16 },
    ];
    expect(foldMonthlyNormals(rows)).toEqual([
      { month: 9, tempMaxC: 27, tempMinC: 18 },
    ]);
  });

  it("월 범위를 벗어난 행은 버린다", () => {
    const rows = [
      { month: 0, tempMaxC: 9, tempMinC: 1 },
      { month: 13, tempMaxC: 9, tempMinC: 1 },
      { month: 6, tempMaxC: 27, tempMinC: 19 },
    ];
    expect(foldMonthlyNormals(rows)).toEqual([
      { month: 6, tempMaxC: 27, tempMinC: 19 },
    ]);
  });

  it("빈 입력이면 빈 배열", () => {
    expect(foldMonthlyNormals([])).toEqual([]);
  });
});
