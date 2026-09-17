import { describe, expect, it } from "vitest";
import {
  distanceKm,
  nearestStation,
  type StationPoint,
} from "./nearestStation";

/** 실제 관측소 세 곳. 좌표는 stations 테이블 값이다. */
const STATIONS: StationPoint[] = [
  {
    stationCode: "137",
    nameKo: "상주",
    latitude: 36.4084,
    longitude: 128.1574,
  },
  {
    stationCode: "108",
    nameKo: "서울",
    latitude: 37.5714,
    longitude: 126.9658,
  },
  { stationCode: "159", nameKo: "부산", latitude: 35.1047, longitude: 129.032 },
];

describe("distanceKm", () => {
  it("같은 점이면 0", () => {
    expect(distanceKm(36.4, 128.1, 36.4, 128.1)).toBe(0);
  });

  it("ai-service 의 haversine_km 과 같은 값을 낸다", () => {
    // 서울–부산. `app/domain/geo.py` 에 같은 좌표를 넣으면 330.86042436695 다.
    // 두 구현이 갈리면 화면과 LLM 이 서로 다른 관측소를 골라 누적 GDD 가 둘이 된다.
    expect(distanceKm(37.5714, 126.9658, 35.1047, 129.032)).toBeCloseTo(
      330.86,
      2,
    );
  });
});

describe("nearestStation", () => {
  it("대권거리가 가장 짧은 곳을 고른다", () => {
    const plot = { latitude: 36.42, longitude: 128.16 };
    expect(nearestStation(plot, STATIONS)?.stationCode).toBe("137");
  });

  it("관측소가 없으면 null — 밭 좌표만으로는 기온을 못 읽는다", () => {
    expect(nearestStation({ latitude: 36.4, longitude: 128.1 }, [])).toBeNull();
  });

  it("목록 순서가 바뀌어도 같은 곳이 나온다", () => {
    const plot = { latitude: 35.2, longitude: 129.0 };
    const forward = nearestStation(plot, STATIONS);
    const backward = nearestStation(plot, [...STATIONS].reverse());
    expect(forward?.stationCode).toBe(backward?.stationCode);
  });
});
