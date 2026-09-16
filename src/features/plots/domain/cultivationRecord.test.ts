import { describe, expect, it } from "vitest";
import {
  type CultivationRecord,
  cultivationDays,
  filterByYear,
  groupByYear,
  yearOf,
} from "./cultivationRecord";

function record(over: Partial<CultivationRecord> = {}): CultivationRecord {
  return {
    id: "r1",
    plotKo: "배추밭",
    cropKo: "배추",
    sowingDate: "2026-08-20",
    harvestDate: "2026-11-05",
    yieldKg: 120,
    noteKo: null,
    ...over,
  };
}

describe("yearOf", () => {
  it("파종이 아니라 수확 연도로 센다 — 해를 넘겨 거두는 작물이 있다", () => {
    const garlic = record({
      sowingDate: "2025-10-12",
      harvestDate: "2026-06-08",
    });
    expect(yearOf(garlic)).toBe(2026);
  });

  it("연초 날짜가 시간대 때문에 전년으로 밀리지 않는다", () => {
    // new Date("2026-01-01").getFullYear() 는 UTC 서쪽 환경에서 2025 가 된다.
    expect(yearOf(record({ harvestDate: "2026-01-01" }))).toBe(2026);
  });
});

describe("groupByYear", () => {
  it("최신 해가 먼저 온다", () => {
    const years = groupByYear([
      record({ id: "a", harvestDate: "2024-09-01" }),
      record({ id: "b", harvestDate: "2026-09-01" }),
      record({ id: "c", harvestDate: "2025-09-01" }),
    ]);
    expect(years.map((y) => y.year)).toEqual([2026, 2025, 2024]);
  });

  it("같은 해 안에서는 수확일 늦은 순이다", () => {
    const [year] = groupByYear([
      record({ id: "early", harvestDate: "2026-03-02" }),
      record({ id: "late", harvestDate: "2026-11-30" }),
      record({ id: "mid", harvestDate: "2026-07-15" }),
    ]);
    expect(year.records.map((r) => r.id)).toEqual(["late", "mid", "early"]);
  });

  it("수확량 합계를 낸다", () => {
    const [year] = groupByYear([
      record({ id: "a", yieldKg: 100 }),
      record({ id: "b", yieldKg: 55.5 }),
    ]);
    expect(year.totalYieldKg).toBe(155.5);
  });

  it("적어 둔 수확량이 하나도 없으면 합계가 null 이다 — 0kg 흉작과 구별해야 한다", () => {
    const [year] = groupByYear([
      record({ id: "a", yieldKg: null }),
      record({ id: "b", yieldKg: null }),
    ]);
    expect(year.totalYieldKg).toBeNull();
  });

  it("일부만 적혀 있으면 적힌 것만 더한다", () => {
    const [year] = groupByYear([
      record({ id: "a", yieldKg: 80 }),
      record({ id: "b", yieldKg: null }),
    ]);
    expect(year.totalYieldKg).toBe(80);
  });

  it("0kg 은 미기록으로 뭉개지 않는다", () => {
    const [year] = groupByYear([record({ yieldKg: 0 })]);
    expect(year.totalYieldKg).toBe(0);
  });

  it("빈 입력은 빈 배열이다", () => {
    expect(groupByYear([])).toEqual([]);
  });

  it("원본 배열을 건드리지 않는다", () => {
    const rows = [
      record({ id: "a", harvestDate: "2024-01-01" }),
      record({ id: "b", harvestDate: "2026-01-01" }),
    ];
    groupByYear(rows);
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("filterByYear", () => {
  const rows = [
    record({ id: "a", harvestDate: "2026-05-01" }),
    record({ id: "b", harvestDate: "2025-05-01" }),
  ];

  it("고른 해만 남긴다", () => {
    expect(filterByYear(rows, 2025).map((r) => r.id)).toEqual(["b"]);
  });

  it("null 이면 전부 남긴다", () => {
    expect(filterByYear(rows, null)).toHaveLength(2);
  });

  it("기록이 없는 해를 고르면 빈 배열이다", () => {
    expect(filterByYear(rows, 1999)).toEqual([]);
  });
});

describe("cultivationDays", () => {
  it("파종일부터 수확일까지 날짜 수를 센다", () => {
    expect(
      cultivationDays(
        record({ sowingDate: "2026-08-20", harvestDate: "2026-11-05" }),
      ),
    ).toBe(77);
  });

  it("해를 넘겨도 맞는다", () => {
    expect(
      cultivationDays(
        record({ sowingDate: "2025-10-12", harvestDate: "2026-06-08" }),
      ),
    ).toBe(239);
  });

  it("서머타임 전환을 걸쳐도 하루씩 어긋나지 않는다", () => {
    // 미국/유럽 서머타임 전환일을 포함하는 구간. 지역 시간대로 파싱하면 23시간
    // 짜리 하루가 생겨 반올림이 어긋난다.
    expect(
      cultivationDays(
        record({ sowingDate: "2026-03-01", harvestDate: "2026-04-01" }),
      ),
    ).toBe(31);
  });

  it("날짜가 망가져 있으면 0 을 준다 — 화면이 NaN 을 그리지 않게", () => {
    expect(cultivationDays(record({ sowingDate: "" }))).toBe(0);
  });
});
