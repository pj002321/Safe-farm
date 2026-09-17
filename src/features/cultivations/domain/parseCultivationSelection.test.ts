import { describe, expect, it } from "vitest";
import {
  parseCultivationSelections,
  toCultivationInputs,
} from "./parseCultivationSelection";

function formData(entries: Record<string, string | string[]>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    for (const v of Array.isArray(value) ? value : [value]) {
      fd.append(key, v);
    }
  }
  return fd;
}

describe("parseCultivationSelections", () => {
  it("작물마다 파종 필드를 따로 읽는다", () => {
    const result = parseCultivationSelections(
      formData({
        cropIds: ["5", "7"],
        "sowingDate.5": "2025-08-01",
        "sowingMethod.5": "seedling",
        "sowingStatus.5": "known",
        "sowingStatus.7": "unknown",
      }),
    );
    expect(result).toEqual([
      {
        cropId: 5,
        sowingDate: "2025-08-01",
        sowingUnknown: false,
        sowingMethod: "seedling",
      },
      {
        cropId: 7,
        sowingDate: null,
        sowingUnknown: true,
        sowingMethod: "seed",
      },
    ]);
  });

  it("숫자가 아닌 작물 값은 버린다 — 예전 슬러그가 섞여 들어와도 막힌다", () => {
    const result = parseCultivationSelections(
      formData({ cropIds: ["cabbage", "0", "3"] }),
    );
    expect(result.map((s) => s.cropId)).toEqual([3]);
  });
});

describe("toCultivationInputs", () => {
  it("품종이 없는 작물은 건너뛴다", () => {
    const result = toCultivationInputs(
      [
        {
          cropId: 5,
          sowingDate: "2025-08-01",
          sowingUnknown: false,
          sowingMethod: "seed",
        },
        {
          cropId: 9,
          sowingDate: null,
          sowingUnknown: false,
          sowingMethod: "seed",
        },
      ],
      new Map([[5, 105]]),
    );
    expect(result).toEqual([
      {
        variantId: 105,
        status: "GROWING",
        sowingDate: "2025-08-01",
        sowingType: "SEED",
      },
    ]);
  });

  it("파종 미정이면 PLANNED 로, 날짜도 비운다", () => {
    const result = toCultivationInputs(
      [
        {
          cropId: 5,
          sowingDate: "2025-08-01",
          sowingUnknown: true,
          sowingMethod: "seedling",
        },
      ],
      new Map([[5, 105]]),
    );
    expect(result).toEqual([
      {
        variantId: 105,
        status: "PLANNED",
        sowingDate: null,
        sowingType: "SEEDLING",
      },
    ]);
  });

  it("미정 체크를 안 해도 날짜를 안 넣으면 PLANNED 다 — GROWING+날짜없음은 DB 제약 위반", () => {
    const result = toCultivationInputs(
      [
        {
          cropId: 5,
          sowingDate: null,
          sowingUnknown: false,
          sowingMethod: "seed",
        },
      ],
      new Map([[5, 105]]),
    );
    expect(result).toEqual([
      {
        variantId: 105,
        status: "PLANNED",
        sowingDate: null,
        sowingType: "SEED",
      },
    ]);
  });
});
