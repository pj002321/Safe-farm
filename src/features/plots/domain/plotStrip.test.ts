import { describe, expect, it } from "vitest";
import { toAreaKo, toCropKo, toDayLabelKo, toPlotStripItem } from "./plotStrip";
import type { PlotCard } from "./plotSummary";

const CARD: PlotCard = {
  id: "p1",
  nameKo: "뒷밭",
  regionKo: "전라북도 임실군 오수면",
  areaM2: 661.16,
  cultivations: [
    { variantId: 3, cropNameKo: "배추", sowingDate: "2026-08-25" },
  ],
  sowingDate: "2026-08-25",
  createdAt: "2026-08-25T00:00:00Z",
};

const NOW = new Date("2026-09-16");

describe("toAreaKo", () => {
  it("㎡ 를 평으로 되돌린다", () => {
    expect(toAreaKo(661.16)).toBe("약 200평");
  });

  it("면적을 건너뛰었으면 숫자를 지어내지 않는다", () => {
    expect(toAreaKo(null)).toBe("면적 미상");
    expect(toAreaKo(0)).toBe("면적 미상");
  });
});

describe("toCropKo", () => {
  it("하나면 이름 그대로다", () => {
    expect(toCropKo(CARD)).toBe("배추");
  });

  it("여럿이면 외 n 으로 접는다", () => {
    const cultivations = [
      { variantId: 3, cropNameKo: "배추", sowingDate: null },
      { variantId: 4, cropNameKo: "무", sowingDate: null },
      { variantId: 5, cropNameKo: "상추", sowingDate: null },
    ];
    expect(toCropKo({ cultivations })).toBe("배추 외 2");
  });

  it("심은 게 없으면 작물 미정이다", () => {
    expect(toCropKo({ cultivations: [] })).toBe("작물 미정");
  });
});

describe("toDayLabelKo", () => {
  it("심은 날부터 D+n 을 만든다", () => {
    expect(toDayLabelKo({ sowingDate: "2026-08-25" }, NOW)).toBe("D+22");
  });

  it("파종일을 모르면 0 일로 치지 않는다", () => {
    expect(toDayLabelKo({ sowingDate: null }, NOW)).toBe("—");
  });
});

describe("toPlotStripItem", () => {
  it("카드 한 장에 필요한 글자를 모두 채운다", () => {
    expect(toPlotStripItem(CARD, NOW, "결구기")).toEqual({
      id: "p1",
      nameKo: "뒷밭",
      cropKo: "배추",
      dayLabelKo: "D+22",
      stageKo: "결구기",
      areaKo: "약 200평",
    });
  });

  it("이름을 안 지었으면 대체 문구를 넣는다", () => {
    expect(toPlotStripItem({ ...CARD, nameKo: null }, NOW).nameKo).toBe(
      "이름 없는 밭",
    );
  });

  it("단계를 안 넘기면 null 이다 — 배지를 그리지 않는다", () => {
    expect(toPlotStripItem(CARD, NOW).stageKo).toBeNull();
  });
});
