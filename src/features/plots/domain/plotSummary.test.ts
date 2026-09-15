import { describe, expect, it } from "vitest";
import { daysSincePlanting, type PlotCardRow, toPlotCard } from "./plotSummary";

describe("daysSincePlanting", () => {
  it("심은 날로부터 지난 날수를 센다", () => {
    const days = daysSincePlanting(
      { sowingDate: "2026-09-01", sowingUnknown: false },
      new Date("2026-09-15"),
    );
    expect(days).toBe(14);
  });

  it("심은 날을 모르면 null이다", () => {
    const days = daysSincePlanting(
      { sowingDate: null, sowingUnknown: true },
      new Date("2026-09-15"),
    );
    expect(days).toBeNull();
  });
});

describe("toPlotCard", () => {
  const row: PlotCardRow = {
    id: "p1",
    name: "뒷밭",
    area_m2: 12.5,
    region_ko: "전라북도 임실군 오수면",
    crops: ["tomato", "lettuce"],
    sowing_date: "2026-09-01",
    sowing_unknown: false,
    created_at: "2026-09-01T00:00:00Z",
  };

  it("심은 작물을 전부 넘긴다", () => {
    expect(toPlotCard(row).cropIds).toEqual(["tomato", "lettuce"]);
  });

  it("작물을 고르지 않았으면 빈 배열이다", () => {
    expect(toPlotCard({ ...row, crops: [] }).cropIds).toEqual([]);
  });

  it("이름과 면적이 비면 null로 둔다 — 대체 문구는 화면이 고른다", () => {
    const card = toPlotCard({ ...row, name: null, area_m2: null });
    expect(card.nameKo).toBeNull();
    expect(card.areaM2).toBeNull();
  });

  it("카드도 daysSincePlanting에 그대로 넣을 수 있다", () => {
    const card = toPlotCard({ ...row, sowing_date: null, sowing_unknown: true });
    expect(daysSincePlanting(card, new Date("2026-09-15"))).toBeNull();
  });
});