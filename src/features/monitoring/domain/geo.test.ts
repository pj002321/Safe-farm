import { describe, expect, it } from "vitest";
import {
  formatLatLon,
  greatCircleDistanceKm,
  latLonToVec3,
  orbitPosition,
  vec3ToLatLon,
} from "./geo";

/**
 * 좌표 규약(+Y 북극, 동경 +Z)이 한 번 어긋나면 지구본의 모든 마커가 엉뚱한 곳에
 * 찍힌다. 화면을 눈으로 확인하기 전에 여기서 축을 못 박는다.
 */

/** 경도 ±180 경계와 극점을 포함한 왕복 검증 표본. */
const SAMPLES = [
  { lat: 0, lon: 0 },
  { lat: 37.57, lon: 126.98 },
  { lat: -33.86, lon: 151.21 },
  { lat: 51.51, lon: -0.13 },
  { lat: 0, lon: 180 },
  { lat: 0, lon: -180 },
  { lat: 90, lon: 0 },
  { lat: -90, lon: 0 },
];

describe("latLonToVec3", () => {
  it("북극은 +Y 축 위에 놓인다", () => {
    const p = latLonToVec3({ lat: 90, lon: 0 }, 1);
    expect(p.x).toBeCloseTo(0, 10);
    expect(p.y).toBeCloseTo(1, 10);
    expect(p.z).toBeCloseTo(0, 10);
  });

  it("경도 0°는 +X, 동경 90°는 +Z 를 향한다", () => {
    expect(latLonToVec3({ lat: 0, lon: 0 }, 1).x).toBeCloseTo(1, 10);
    expect(latLonToVec3({ lat: 0, lon: 90 }, 1).z).toBeCloseTo(1, 10);
  });

  it("어떤 좌표에서도 벡터 길이가 radius 와 같다", () => {
    for (const coord of SAMPLES) {
      for (const radius of [1, 2.5, 6371]) {
        const p = latLonToVec3(coord, radius);
        expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(radius, 6);
      }
    }
  });
});

describe("vec3ToLatLon", () => {
  it("latLonToVec3 왕복이 원래 좌표로 돌아온다", () => {
    for (const coord of SAMPLES) {
      const back = vec3ToLatLon(latLonToVec3(coord, 3));
      expect(back.lat).toBeCloseTo(coord.lat, 8);
      // 극점에서는 경도가 정의되지 않으므로 위도만 본다.
      if (Math.abs(coord.lat) !== 90) {
        expect(back.lon).toBeCloseTo(coord.lon, 8);
      }
    }
  });

  it("원점은 NaN 대신 (0, 0)으로 떨어진다", () => {
    expect(vec3ToLatLon({ x: 0, y: 0, z: 0 })).toEqual({ lat: 0, lon: 0 });
  });
});

describe("greatCircleDistanceKm", () => {
  it("서울~부산은 대략 320~340km 다", () => {
    const km = greatCircleDistanceKm(
      { lat: 37.57, lon: 126.98 },
      { lat: 35.18, lon: 129.08 },
    );
    expect(km).toBeGreaterThan(320);
    expect(km).toBeLessThan(340);
  });

  it("같은 지점이면 정확히 0 이다", () => {
    const seoul = { lat: 37.57, lon: 126.98 };
    expect(greatCircleDistanceKm(seoul, seoul)).toBe(0);
  });

  it("방향을 바꿔도 같은 거리다", () => {
    const a = { lat: 33.25, lon: 126.56 };
    const b = { lat: 38.15, lon: 127.31 };
    expect(greatCircleDistanceKm(a, b)).toBeCloseTo(
      greatCircleDistanceKm(b, a),
      9,
    );
  });
});

describe("orbitPosition", () => {
  it("t=0 과 t=1 은 같은 지점이다 (한 바퀴 = 위상 1)", () => {
    const start = orbitPosition(0, 2, 51.6);
    const end = orbitPosition(1, 2, 51.6);
    expect(end.x).toBeCloseTo(start.x, 10);
    expect(end.y).toBeCloseTo(start.y, 10);
    expect(end.z).toBeCloseTo(start.z, 10);
  });

  it("궤도 반지름이 일정하다", () => {
    for (const t of [0, 0.13, 0.25, 0.5, 0.87, 1]) {
      const p = orbitPosition(t, 2.4, 97.8);
      expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(2.4, 10);
    }
  });

  it("경사각 0°면 적도면(Y=0)을 벗어나지 않는다", () => {
    for (const t of [0, 0.3, 0.75]) {
      expect(orbitPosition(t, 2, 0).y).toBeCloseTo(0, 10);
    }
  });

  it("경사각 90°면 극궤도라 1/4 바퀴에서 극점을 지난다", () => {
    const quarter = orbitPosition(0.25, 2, 90);
    expect(quarter.y).toBeCloseTo(-2, 10);
  });
});

describe("formatLatLon", () => {
  it("북반구·동경은 N/E 를 쓴다", () => {
    expect(formatLatLon({ lat: 36.5, lon: 127.8 })).toBe("36.50°N 127.80°E");
  });

  it("남반구·서경은 S/W 를 쓴다", () => {
    expect(formatLatLon({ lat: -33.87, lon: -70.67 })).toBe("33.87°S 70.67°W");
  });

  it("소수 둘째 자리에서 반올림하고, -0 은 부호 없이 적는다", () => {
    expect(formatLatLon({ lat: 1.006, lon: -0.001 })).toBe("1.01°N 0.00°E");
  });
});
