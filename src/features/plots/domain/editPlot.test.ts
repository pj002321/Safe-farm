import { describe, expect, it } from "vitest";
import { parsePlotEdit } from "./editPlot";

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.append(key, value);
  return fd;
}

const ID = "aaaaaaaa-0000-0000-0000-000000000001";

describe("parsePlotEdit", () => {
  it("어떤 밭인지 모르면 실패한다", () => {
    const result = parsePlotEdit(formData({ name: "배추밭" }));
    expect(result).toEqual({
      ok: false,
      error: "어떤 텃밭인지 알 수 없습니다.",
    });
  });

  it("이름과 넓이를 ㎡ 로 받는다", () => {
    const result = parsePlotEdit(
      formData({ plotId: ID, name: "배추밭", areaM2: "330", areaUnit: "m2" }),
    );
    expect(result).toEqual({
      ok: true,
      value: { plotId: ID, name: "배추밭", areaM2: 330 },
    });
  });

  it("평으로 들어오면 ㎡ 로 바꾼다 — 등록 화면과 같은 계수", () => {
    const result = parsePlotEdit(
      formData({ plotId: ID, areaM2: "100", areaUnit: "pyeong" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.areaM2).toBeCloseTo(330.5785, 4);
  });

  it("앞뒤 공백은 지운다", () => {
    const result = parsePlotEdit(formData({ plotId: ID, name: "  배추밭  " }));
    expect(result.ok && result.value.name).toBe("배추밭");
  });

  it("이름을 비우면 null 이다 — 빈 문자열로 저장하면 이름 있는 밭처럼 보인다", () => {
    const result = parsePlotEdit(formData({ plotId: ID, name: "   " }));
    expect(result.ok && result.value.name).toBeNull();
  });

  it("넓이를 비우면 null 이다 — 모른다는 뜻이지 오류가 아니다", () => {
    const result = parsePlotEdit(formData({ plotId: ID, areaM2: "" }));
    expect(result).toEqual({
      ok: true,
      value: { plotId: ID, name: null, areaM2: null },
    });
  });

  it("이름이 40자를 넘으면 실패한다", () => {
    const result = parsePlotEdit(
      formData({ plotId: ID, name: "밭".repeat(41) }),
    );
    expect(result.ok).toBe(false);
  });

  it("40자는 통과한다 — 경계", () => {
    const result = parsePlotEdit(
      formData({ plotId: ID, name: "밭".repeat(40) }),
    );
    expect(result.ok).toBe(true);
  });

  it.each(["0", "-5", "abc"])("넓이가 %s 이면 실패한다", (areaM2) => {
    const result = parsePlotEdit(formData({ plotId: ID, areaM2 }));
    expect(result).toEqual({
      ok: false,
      error: "넓이는 0보다 큰 숫자로 적어 주세요.",
    });
  });

  it("넓이가 터무니없이 크면 실패한다 — 0 을 더 누른 오타를 거른다", () => {
    const result = parsePlotEdit(
      formData({ plotId: ID, areaM2: "99999999", areaUnit: "m2" }),
    );
    expect(result.ok).toBe(false);
  });

  it("위경도를 보내도 무시한다 — 격자 재계산 없이 좌표가 바뀌면 안 된다", () => {
    const result = parsePlotEdit(
      formData({
        plotId: ID,
        name: "배추밭",
        latitude: "37.5",
        longitude: "127.0",
        grid_x: "60",
        grid_y: "127",
        user_id: "22222222-2222-2222-2222-222222222222",
      }),
    );
    expect(result).toEqual({
      ok: true,
      value: { plotId: ID, name: "배추밭", areaM2: null },
    });
  });
});
