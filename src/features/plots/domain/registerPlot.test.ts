import { describe, expect, it } from "vitest";
import { parsePlotRegistration } from "./registerPlot";

function formData(entries: Record<string, string | string[]>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    for (const v of Array.isArray(value) ? value : [value]) {
      fd.append(key, v);
    }
  }
  return fd;
}

const VALID_LOCATION = {
  latitude: "36.4109",
  longitude: "128.159",
  addressKo: "경북 상주시 낙양동",
  regionCode: "4725011000",
  regionKo: "경상북도 상주시 낙양동",
};

describe("parsePlotRegistration", () => {
  it("위치가 없으면 실패한다", () => {
    const result = parsePlotRegistration(formData({}));
    expect(result.ok).toBe(false);
  });

  it("위치만 있어도 통과한다 — 나머지는 전부 건너뛸 수 있는 단계다", () => {
    const result = parsePlotRegistration(formData(VALID_LOCATION));
    expect(result).toEqual({
      ok: true,
      value: {
        name: null,
        areaM2: null,
        latitude: 36.4109,
        longitude: 128.159,
        addressKo: "경북 상주시 낙양동",
        regionCode: "4725011000",
        regionKo: "경상북도 상주시 낙양동",
        crops: [],
        sowingDate: null,
        sowingUnknown: false,
        sowingMethod: "seed",
      },
    });
  });

  it("면적을 평으로 넣으면 ㎡ 로 환산한다", () => {
    const result = parsePlotRegistration(
      formData({ ...VALID_LOCATION, areaM2: "10", areaUnit: "pyeong" }),
    );
    expect(result.ok && result.value.areaM2).toBeCloseTo(33.05785);
  });

  it("면적을 ㎡ 로 넣으면 그대로 쓴다", () => {
    const result = parsePlotRegistration(
      formData({ ...VALID_LOCATION, areaM2: "50", areaUnit: "m2" }),
    );
    expect(result.ok && result.value.areaM2).toBe(50);
  });

  it("작물은 여러 개 담긴다", () => {
    const result = parsePlotRegistration(
      formData({ ...VALID_LOCATION, crops: ["cabbage", "rice"] }),
    );
    expect(result.ok && result.value.crops).toEqual(["cabbage", "rice"]);
  });
});
