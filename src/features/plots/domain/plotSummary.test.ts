import { describe, expect, it } from "vitest";
import {
  type CultivationRow,
  daysSincePlanting,
  type PlotCardRow,
  toPlotCard,
  toPlotMapPoint,
} from "./plotSummary";

let nextVariantId = 1;

function cultivation(
  nameKo: string | null,
  sowingDate: string | null,
  variantId = nextVariantId++,
): CultivationRow {
  return {
    id: `c${variantId}`,
    variant_id: variantId,
    sowing_date: sowingDate,
    status: "GROWING",
    crop_variants: nameKo ? { crops: { name: nameKo } } : null,
  };
}

describe("daysSincePlanting", () => {
  it("심은 날로부터 지난 날수를 센다", () => {
    const days = daysSincePlanting(
      { sowingDate: "2026-09-01" },
      new Date("2026-09-15"),
    );
    expect(days).toBe(14);
  });

  it("심은 날을 모르면 null이다", () => {
    const days = daysSincePlanting(
      { sowingDate: null },
      new Date("2026-09-15"),
    );
    expect(days).toBeNull();
  });
});

describe("toPlotMapPoint", () => {
  const row = {
    id: "p1",
    name: "뒷밭",
    latitude: 35.6,
    longitude: 127.3,
    cultivations: [
      cultivation("무", "2026-09-10", 11),
      cultivation("배추", "2026-08-25", 22),
    ],
  };

  it("가장 먼저 심은 작물을 마커 대표로 쓴다", () => {
    const point = toPlotMapPoint(row);
    expect(point.cropNameKo).toBe("배추");
    expect(point.sowingDate).toBe("2026-08-25");
  });

  it("대표 재배의 variantId 를 함께 낸다 — 단계표는 품종으로만 찾을 수 있다", () => {
    expect(toPlotMapPoint(row).variantId).toBe(22);
  });

  it("심은 작물이 없으면 작물도 파종일도 null이다", () => {
    const point = toPlotMapPoint({ ...row, cultivations: [] });
    expect(point.cropNameKo).toBeNull();
    expect(point.sowingDate).toBeNull();
    expect(point.variantId).toBeNull();
  });

  it("파종일을 아는 건이 없으면 첫 건을 대표로 둔다", () => {
    const point = toPlotMapPoint({
      ...row,
      cultivations: [cultivation("가지", null)],
    });
    expect(point.cropNameKo).toBe("가지");
    expect(point.sowingDate).toBeNull();
  });
});

describe("toPlotCard", () => {
  const row: PlotCardRow = {
    id: "p1",
    name: "뒷밭",
    area_m2: 12.5,
    region_ko: "전라북도 임실군 오수면",
    created_at: "2026-09-01T00:00:00Z",
    cultivations: [
      cultivation("방울토마토", "2026-09-01", 3),
      cultivation("상추", "2026-09-05", 4),
    ],
  };

  it("심은 것을 품종째로 전부 넘긴다", () => {
    expect(toPlotCard(row).cultivations).toEqual([
      {
        id: "c3",
        variantId: 3,
        cropNameKo: "방울토마토",
        sowingDate: "2026-09-01",
        status: "GROWING",
      },
      {
        id: "c4",
        variantId: 4,
        cropNameKo: "상추",
        sowingDate: "2026-09-05",
        status: "GROWING",
      },
    ]);
  });

  it("작물을 고르지 않았으면 빈 배열이다", () => {
    expect(toPlotCard({ ...row, cultivations: [] }).cultivations).toEqual([]);
  });

  it("이름과 면적이 비면 null로 둔다 — 대체 문구는 화면이 고른다", () => {
    const card = toPlotCard({ ...row, name: null, area_m2: null });
    expect(card.nameKo).toBeNull();
    expect(card.areaM2).toBeNull();
  });

  it("카드도 daysSincePlanting에 그대로 넣을 수 있다", () => {
    const card = toPlotCard({
      ...row,
      cultivations: [cultivation("상추", null)],
    });
    expect(daysSincePlanting(card, new Date("2026-09-15"))).toBeNull();
  });
});
