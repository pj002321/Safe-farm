import { describe, expect, it } from "vitest";
import {
  formatFarmDate,
  formatRainfall,
  formatScore,
  formatTemperature,
} from "./format";

describe("formatTemperature", () => {
  it("소수 첫째 자리까지 반올림한다", () => {
    expect(formatTemperature(22.456)).toBe("22.5°C");
    expect(formatTemperature(-3)).toBe("-3.0°C");
  });

  it("값이 없으면 대시를 낸다 (0과 구분해야 한다)", () => {
    expect(formatTemperature(null)).toBe("—");
    expect(formatTemperature(undefined)).toBe("—");
    expect(formatTemperature(Number.NaN)).toBe("—");
    expect(formatTemperature(0)).toBe("0.0°C");
  });
});

describe("formatRainfall", () => {
  it("1mm 미만 강수는 '미량'으로 표시한다", () => {
    expect(formatRainfall(0.3)).toBe("미량");
    expect(formatRainfall(0.99)).toBe("미량");
  });

  it("0은 미량이 아니라 0mm다", () => {
    expect(formatRainfall(0)).toBe("0mm");
  });

  it("1mm 이상은 반올림한 정수", () => {
    expect(formatRainfall(1)).toBe("1mm");
    expect(formatRainfall(12.6)).toBe("13mm");
  });
});

describe("formatScore", () => {
  it("정수로 반올림해 점을 붙인다", () => {
    expect(formatScore(87)).toBe("87점");
    expect(formatScore(87.6)).toBe("88점");
  });
});

describe("formatFarmDate", () => {
  it("월/일/요일을 한국어로 낸다", () => {
    // 2026-09-09 는 수요일
    const result = formatFarmDate(new Date("2026-09-09T00:00:00Z"));
    expect(result).toContain("9월");
    expect(result).toContain("9일");
  });
});
