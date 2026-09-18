import { describe, expect, it } from "vitest";
import { emptyTaskReason, type InspectablePlot } from "./emptyTaskReason";

function plot(
  id: string,
  cultivations: InspectablePlot["cultivations"],
  nameKo: string | null = `${id}밭`,
): InspectablePlot {
  return { id, nameKo, cultivations };
}

const GROWING = {
  status: "GROWING",
  sowingDate: "2026-08-01",
  cropNameKo: "배추",
};

describe("emptyTaskReason", () => {
  it("작물이 없으면 등록하라고 말한다 — '할 일 없음'으로 뭉개지 않는다", () => {
    expect(emptyTaskReason([plot("p1", [])])).toEqual({
      kind: "no-cultivation",
      plotId: "p1",
      plotKo: "p1밭",
    });
  });

  it("파종일이 없으면 입력하라고 말한다 — 판정을 못 한 것이지 할 일이 없는 게 아니다", () => {
    const result = emptyTaskReason([
      plot("p1", [{ ...GROWING, sowingDate: null }]),
    ]);
    expect(result).toEqual({
      kind: "no-sowing-date",
      plotId: "p1",
      plotKo: "p1밭",
    });
  });

  it("다 갖췄으면 '할 일 없음'이다 — 그때만 그렇게 말해야 한다", () => {
    expect(emptyTaskReason([plot("p1", [GROWING])])).toEqual({
      kind: "nothing-to-do",
    });
  });

  it("수확이 끝난 재배는 판정 대상이 아니다 — 그 밭은 작물이 없는 것으로 본다", () => {
    const result = emptyTaskReason([
      plot("p1", [{ ...GROWING, status: "HARVESTED" }]),
    ]);
    expect(result.kind).toBe("no-cultivation");
  });

  it("실패한 재배도 마찬가지다", () => {
    const result = emptyTaskReason([
      plot("p1", [{ ...GROWING, status: "FAILED" }]),
    ]);
    expect(result.kind).toBe("no-cultivation");
  });

  it("고치기 쉬운 것부터 말한다 — 작물 등록이 파종일보다 먼저", () => {
    const result = emptyTaskReason([
      plot("p1", [{ ...GROWING, sowingDate: null }]),
      plot("p2", []),
    ]);
    expect(result).toMatchObject({ kind: "no-cultivation", plotId: "p2" });
  });

  it("여러 밭이 막혀 있어도 하나만 말한다 — 목록은 무엇부터 할지를 흐린다", () => {
    const result = emptyTaskReason([plot("p1", []), plot("p2", [])]);
    expect(result).toMatchObject({ kind: "no-cultivation", plotId: "p1" });
  });

  it("한 밭에 자라는 작물이 하나라도 있으면 그 밭은 막힌 게 아니다", () => {
    const result = emptyTaskReason([
      plot("p1", [{ ...GROWING, status: "HARVESTED" }, GROWING]),
    ]);
    expect(result).toEqual({ kind: "nothing-to-do" });
  });

  it("이름 없는 밭에도 부를 이름을 준다", () => {
    const result = emptyTaskReason([plot("p1", [], null)]);
    expect(result).toMatchObject({ plotKo: "이름 없는 밭" });
  });

  it("밭이 없으면 조용히 '할 일 없음'이다 — 홈이 온보딩으로 보내는 경로다", () => {
    expect(emptyTaskReason([])).toEqual({ kind: "nothing-to-do" });
  });
});
