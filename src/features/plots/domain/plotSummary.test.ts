import { describe, expect, it } from "vitest";
import { daysSincePlanting } from "./plotSummary";

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