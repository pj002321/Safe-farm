import { describe, expect, it } from "vitest";
import { toTaskAdvices } from "./aiTasks";

const CARD = {
  title: "감자밭 물 주기",
  reason: "14일 수지가 -56mm",
  priority: "high",
};

describe("toTaskAdvices", () => {
  it("제목을 id 로 둔다 — 했음이 제목으로 거른다", () => {
    expect(toTaskAdvices([CARD])[0]).toEqual({
      id: "감자밭 물 주기",
      titleKo: "감자밭 물 주기",
      whyKo: "14일 수지가 -56mm",
      tone: "unsuitable",
    });
  });

  it("급함·보통·여유를 홈과 같은 색으로 옮긴다", () => {
    const tones = toTaskAdvices([
      { ...CARD, title: "a", priority: "high" },
      { ...CARD, title: "b", priority: "mid" },
      { ...CARD, title: "c", priority: "low" },
    ]).map((task) => task.tone);

    expect(tones).toEqual(["unsuitable", "caution", "info"]);
  });

  it("모르는 등급은 가장 약한 쪽으로 — 조용히 급함으로 올리지 않는다", () => {
    expect(toTaskAdvices([{ ...CARD, priority: "긴급" }])[0]?.tone).toBe(
      "info",
    );
  });

  it("제목이 비면 버린다 — 열쇠가 없어 했음과 맞출 수 없다", () => {
    expect(toTaskAdvices([{ ...CARD, title: "  " }, CARD])).toHaveLength(1);
  });

  it("같은 제목이 두 번 오면 한 번만", () => {
    expect(toTaskAdvices([CARD, CARD])).toHaveLength(1);
  });

  it("칸이 빠진 옛 응답에도 안 죽는다 — 두 서비스가 따로 배포된다", () => {
    expect(toTaskAdvices([{ title: "김매기" }])[0]).toEqual({
      id: "김매기",
      titleKo: "김매기",
      whyKo: "",
      tone: "info",
    });
  });
});
