import { describe, expect, it } from "vitest";
import { parsePlotEdit } from "./editPlot";

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.set(key, value);
  return fd;
}

const LOCATION = {
  latitude: "35.6",
  longitude: "127.3",
  addressKo: "전라북도 임실군 오수면",
  regionCode: "4575033000",
  regionKo: "오수면",
};

describe("parsePlotEdit", () => {
  it("위치가 없으면 거절한다 — 0으로 덮이는 것을 막는다", () => {
    const result = parsePlotEdit(form({ name: "뒷밭" }));
    expect(result.ok).toBe(false);
  });

  it("행정동 코드만 빠져도 거절한다", () => {
    const result = parsePlotEdit(form({ ...LOCATION, regionCode: "" }));
    expect(result.ok).toBe(false);
  });

  it("평으로 들어온 면적을 ㎡로 바꾼다", () => {
    const result = parsePlotEdit(
      form({ ...LOCATION, areaM2: "10", areaUnit: "pyeong" }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.value.areaM2).toBeCloseTo(33.06, 1);
  });

  it("이름을 비우면 null로 둔다", () => {
    const result = parsePlotEdit(form({ ...LOCATION, name: "   " }));
    if (!result.ok) throw new Error(result.error);
    expect(result.value.name).toBeNull();
  });

  it("작물과 파종일은 받지 않는다", () => {
    const result = parsePlotEdit(
      form({ ...LOCATION, crops: "rice", sowingDate: "2026-09-01" }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.value).not.toHaveProperty("crops");
    expect(result.value).not.toHaveProperty("sowingDate");
  });
});
