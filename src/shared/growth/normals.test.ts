import { describe, expect, it } from "vitest";
import { type NormalRow, toMonthlyNormals } from "./normals";

const row = (
  source: string,
  month: number,
  tempMaxC: number | null,
  tempMinC: number | null,
): NormalRow => ({ source, month, tempMaxC, tempMinC });

describe("toMonthlyNormals", () => {
  it("일별을 달로 접는다 — 달마다 평균 하나", () => {
    const got = toMonthlyNormals([
      row("kma", 9, 28, 18),
      row("kma", 9, 26, 16),
      row("kma", 10, 20, 10),
    ]);
    expect(got).toEqual([
      { month: 9, tempMaxC: 27, tempMinC: 17 },
      { month: 10, tempMaxC: 20, tempMinC: 10 },
    ]);
  });

  it("달 차례로 나온다 — 12월 뒤에 1월이 오는 입력이어도", () => {
    const got = toMonthlyNormals([row("kma", 12, 5, -3), row("kma", 1, 3, -6)]);
    expect(got.map((m) => m.month)).toEqual([1, 12]);
  });

  it("kma(1991~2020)가 있으면 kma-1981 은 섞지 않는다", () => {
    // 같은 관측소에 두 기준이 같이 있는 곳이 70곳이다. 섞으면 반반 값이 된다
    const got = toMonthlyNormals([
      row("kma", 9, 28, 18),
      row("kma-1981", 9, 20, 10),
    ]);
    expect(got).toEqual([{ month: 9, tempMaxC: 28, tempMinC: 18 }]);
  });

  it("kma 가 없으면 kma-1981 로 내려간다", () => {
    const got = toMonthlyNormals([row("kma-1981", 9, 20, 10)]);
    expect(got).toEqual([{ month: 9, tempMaxC: 20, tempMinC: 10 }]);
  });

  it("결측일은 평균에서 뺀다", () => {
    const got = toMonthlyNormals([
      row("kma", 9, 30, 20),
      row("kma", 9, null, 18),
      row("kma", 9, 26, null),
    ]);
    expect(got).toEqual([{ month: 9, tempMaxC: 30, tempMinC: 20 }]);
  });

  it("행이 없거나 아는 source 가 없으면 빈 배열 — _2 가 null 을 내고 _1 로 넘어간다", () => {
    expect(toMonthlyNormals([])).toEqual([]);
    expect(toMonthlyNormals([row("open-meteo", 9, 28, 18)])).toEqual([]);
  });

  it("1~12 밖의 달은 버린다", () => {
    expect(
      toMonthlyNormals([row("kma", 13, 1, 1), row("kma", 0, 1, 1)]),
    ).toEqual([]);
  });
});
