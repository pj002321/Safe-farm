import { describe, expect, it } from "vitest";
import { cropShare } from "./cropShare";

describe("cropShare", () => {
  it("이름별로 세고 많은 순으로 자른다", () => {
    expect(
      cropShare(["상추", "고추", "상추", null, "고추", "상추"], 2),
    ).toEqual([
      { nameKo: "상추", count: 3 },
      { nameKo: "고추", count: 2 },
    ]);
  });

  it("이름이 비면 미상으로 센다", () => {
    expect(cropShare([null], 5)).toEqual([{ nameKo: "미상", count: 1 }]);
  });
});
