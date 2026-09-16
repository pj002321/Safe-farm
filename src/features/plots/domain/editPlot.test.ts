import { describe, expect, it } from "vitest";
import { parsePlotEdit } from "./editPlot";

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.set(key, value);
  return fd;
}

describe("parsePlotEdit", () => {
  it("평으로 들어온 면적을 ㎡로 바꾼다", () => {
    const value = parsePlotEdit(form({ areaM2: "10", areaUnit: "pyeong" }));
    expect(value.areaM2).toBeCloseTo(33.06, 1);
  });

  it("이름을 비우면 null로 둔다", () => {
    expect(parsePlotEdit(form({ name: "   " })).name).toBeNull();
  });

  it("위치가 실려 와도 받지 않는다", () => {
    const value = parsePlotEdit(
      form({
        name: "뒷밭",
        latitude: "35.6",
        longitude: "127.3",
        addressKo: "전라북도 임실군 오수면",
        regionCode: "4575033000",
        regionKo: "오수면",
      }),
    );
    expect(Object.keys(value)).toEqual(["name", "areaM2"]);
  });

  it("작물과 파종일은 받지 않는다", () => {
    const value = parsePlotEdit(
      form({ crops: "rice", sowingDate: "2026-09-01" }),
    );
    expect(value).not.toHaveProperty("crops");
    expect(value).not.toHaveProperty("sowingDate");
  });
});
