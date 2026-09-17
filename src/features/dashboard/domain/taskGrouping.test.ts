import { describe, expect, it } from "vitest";
import {
  activePlotIds,
  type GroupablePlot,
  groupTasksByPlot,
  totalOpenCount,
} from "./taskGrouping";
import type { Priority, TaskCardData } from "./taskSummary";

function card(
  id: string,
  plotId: string,
  priority: Priority,
  done = false,
): TaskCardData {
  return {
    id,
    plotId,
    titleKo: `작업 ${id}`,
    reasonKo: "근거",
    priority,
    plotKo: "",
    daysOpen: 0,
    expired: false,
    done,
  };
}

const PLOTS: GroupablePlot[] = [
  { id: "p1", nameKo: "상주 배추밭" },
  { id: "p2", nameKo: "뒷밭 상추" },
  { id: "p3", nameKo: null },
];

describe("groupTasksByPlot", () => {
  it("카드가 없는 밭도 자리를 남긴다 — 빠지면 사용자는 밭을 빠뜨린 줄 안다", () => {
    const groups = groupTasksByPlot([card("a", "p1", "mid")], PLOTS);
    expect(groups.map((g) => g.plotId).sort()).toEqual(["p1", "p2", "p3"]);
  });

  it("급한 카드를 가진 밭이 위로 온다", () => {
    const groups = groupTasksByPlot(
      [card("a", "p2", "low"), card("b", "p3", "high"), card("c", "p1", "mid")],
      PLOTS,
    );
    expect(groups.map((g) => g.plotId)).toEqual(["p3", "p1", "p2"]);
  });

  it("할 일 없는 밭은 항상 맨 아래다 — 완료만 있어도 마찬가지", () => {
    const groups = groupTasksByPlot(
      [card("a", "p1", "high", true), card("b", "p2", "low")],
      PLOTS,
    );
    // p2 는 미완료 low 가 있으므로 p1(완료뿐)·p3(없음)보다 위.
    expect(groups[0].plotId).toBe("p2");
    expect(groups.slice(1).every((g) => g.open.length === 0)).toBe(true);
  });

  it("밭 안에서 급한 순으로 정렬한다", () => {
    const groups = groupTasksByPlot(
      [
        card("low", "p1", "low"),
        card("high", "p1", "high"),
        card("mid", "p1", "mid"),
      ],
      PLOTS,
    );
    const p1 = groups.find((g) => g.plotId === "p1");
    expect(p1?.open.map((t) => t.id)).toEqual(["high", "mid", "low"]);
  });

  it("완료와 미완료를 나눠 담는다", () => {
    const groups = groupTasksByPlot(
      [card("a", "p1", "high"), card("b", "p1", "mid", true)],
      PLOTS,
    );
    const p1 = groups.find((g) => g.plotId === "p1");
    expect(p1?.open.map((t) => t.id)).toEqual(["a"]);
    expect(p1?.done.map((t) => t.id)).toEqual(["b"]);
  });

  it("지운 밭의 카드는 버린다 — 누를 곳이 없는 카드를 그리지 않는다", () => {
    const groups = groupTasksByPlot(
      [card("a", "p1", "high"), card("ghost", "삭제된밭", "high")],
      PLOTS,
    );
    expect(totalOpenCount(groups)).toBe(1);
  });

  it("이름 없는 밭에도 부를 이름을 준다", () => {
    const groups = groupTasksByPlot([], PLOTS);
    expect(groups.find((g) => g.plotId === "p3")?.plotKo).toBe("이름 없는 밭");
  });

  it("밭이 하나도 없으면 빈 배열이다", () => {
    expect(groupTasksByPlot([card("a", "p1", "high")], [])).toEqual([]);
  });
});

describe("totalOpenCount", () => {
  it("미완료만 센다", () => {
    const groups = groupTasksByPlot(
      [
        card("a", "p1", "high"),
        card("b", "p2", "mid"),
        card("c", "p1", "low", true),
      ],
      PLOTS,
    );
    expect(totalOpenCount(groups)).toBe(2);
  });
});

describe("activePlotIds", () => {
  const plot = (id: string, statuses: string[]) => ({
    id,
    cultivations: statuses.map((status) => ({ status })),
  });

  it("자라는 중이면 살아 있다", () => {
    const ids = activePlotIds([plot("p1", ["GROWING"])]);
    expect(ids.has("p1")).toBe(true);
  });

  it("전부 수확했으면 내려간다 — 한 철이 끝난 밭이다", () => {
    const ids = activePlotIds([plot("p1", ["HARVESTED", "HARVESTED"])]);
    expect(ids.has("p1")).toBe(false);
  });

  it("하나라도 안 끝났으면 남는다", () => {
    const ids = activePlotIds([plot("p1", ["HARVESTED", "GROWING"])]);
    expect(ids.has("p1")).toBe(true);
  });

  it("아직 아무것도 안 심은 밭은 살아 있는 것으로 본다", () => {
    expect(activePlotIds([plot("p1", [])]).has("p1")).toBe(true);
  });

  it("실패한 재배도 수확이 아니라 살아 있다 — 다시 심을 수 있다", () => {
    expect(activePlotIds([plot("p1", ["FAILED"])]).has("p1")).toBe(true);
  });
});
