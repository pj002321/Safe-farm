import { describe, expect, it } from "vitest";
import { interpolateDeg } from "./windField";

describe("interpolateDeg", () => {
  it("returns null with no samples", () => {
    expect(interpolateDeg([], 36, 127)).toBeNull();
  });

  it("picks the nearer sample's direction more strongly", () => {
    const deg = interpolateDeg(
      [
        { lat: 36, lng: 127, deg: 90 },
        { lat: 40, lng: 130, deg: 270 },
      ],
      36.01,
      127.01,
    );
    expect(deg).not.toBeNull();
    expect(deg as number).toBeGreaterThan(45);
    expect(deg as number).toBeLessThan(135);
  });

  it("averages across the 0/360 boundary without wrapping to 180", () => {
    const deg = interpolateDeg(
      [
        { lat: 36, lng: 127, deg: 350 },
        { lat: 36, lng: 127.0001, deg: 10 },
      ],
      36,
      127.00005,
    );
    expect(deg).not.toBeNull();
    // 진짜 평균은 0° 근처여야 한다 — 각도를 그냥 산술평균하면 180°가 나온다.
    const value = deg as number;
    const wrapped = value > 180 ? value - 360 : value;
    expect(Math.abs(wrapped)).toBeLessThan(5);
  });
});
