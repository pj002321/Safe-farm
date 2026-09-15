import { describe, expect, it } from "vitest";
import { FIELD_PATCH_COUNT, generateFieldPatches } from "./fieldPatches";

describe("generateFieldPatches", () => {
  it("선언한 개수만큼 만든다", () => {
    expect(generateFieldPatches()).toHaveLength(FIELD_PATCH_COUNT);
  });

  it("같은 씨앗이면 같은 배열이다 — 하이드레이션이 어긋나면 안 된다", () => {
    expect(generateFieldPatches(42)).toEqual(generateFieldPatches(42));
  });

  it("씨앗이 다르면 배치가 달라진다", () => {
    expect(generateFieldPatches(1)).not.toEqual(generateFieldPatches(2));
  });

  it("좌표가 전부 유효 범위 안이다", () => {
    for (const patch of generateFieldPatches()) {
      expect(patch.coord.lat).toBeGreaterThan(-90);
      expect(patch.coord.lat).toBeLessThan(90);
      expect(patch.coord.lon).toBeGreaterThan(-180);
      expect(patch.coord.lon).toBeLessThan(180);
    }
  });

  it("한반도 무리는 한반도 안에 떨어진다 — 바다 위에 밭이 뜨면 안 된다", () => {
    const home = generateFieldPatches().filter((p) => p.home);
    expect(home.length).toBeGreaterThan(30);
    for (const patch of home) {
      expect(patch.coord.lat).toBeGreaterThan(32.5);
      expect(patch.coord.lat).toBeLessThan(39);
      expect(patch.coord.lon).toBeGreaterThan(125.5);
      expect(patch.coord.lon).toBeLessThan(130);
    }
  });

  it("세계 무리가 한반도보다 많다 — 지구가 도는 동안 농지가 계속 보여야 한다", () => {
    const patches = generateFieldPatches();
    const away = patches.filter((p) => !p.home);
    expect(away.length).toBeGreaterThan(patches.length / 2);
  });

  it("관측 지역 패치가 평균적으로 더 크다", () => {
    const patches = generateFieldPatches();
    const avg = (rows: typeof patches) =>
      rows.reduce((sum, p) => sum + p.sizeScale, 0) / rows.length;
    expect(avg(patches.filter((p) => p.home))).toBeGreaterThan(
      avg(patches.filter((p) => !p.home)),
    );
  });

  it("크기·회전·활력이 전부 정해진 범위 안이다", () => {
    for (const patch of generateFieldPatches()) {
      // 세계 0.6~1.5, 관측 지역 0.9~1.8
      expect(patch.sizeScale).toBeGreaterThanOrEqual(0.6);
      expect(patch.sizeScale).toBeLessThanOrEqual(1.8);
      expect(patch.spinRad).toBeGreaterThanOrEqual(0);
      expect(patch.spinRad).toBeLessThan(Math.PI * 2);
      expect(patch.vigor).toBeGreaterThanOrEqual(0);
      expect(patch.vigor).toBeLessThanOrEqual(1);
    }
  });

  it("좌표가 전부 다르다 — 겹쳐 찍히면 한 점으로 보인다", () => {
    const patches = generateFieldPatches();
    const keys = new Set(
      patches.map((p) => `${p.coord.lat.toFixed(6)},${p.coord.lon.toFixed(6)}`),
    );
    expect(keys.size).toBe(patches.length);
  });

  it("활력이 한 값에 몰려 있지 않다 — 색이 한 톤이면 뿌린 의미가 없다", () => {
    const vigors = generateFieldPatches().map((p) => p.vigor);
    const low = vigors.filter((v) => v < 0.4).length;
    const high = vigors.filter((v) => v > 0.6).length;
    expect(low).toBeGreaterThan(3);
    expect(high).toBeGreaterThan(3);
  });
});
