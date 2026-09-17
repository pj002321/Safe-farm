import { describe, expect, it } from "vitest";
import { parsePlotId, parseQuestion, QUESTION_MAX_LENGTH } from "./askQuestion";

describe("parseQuestion", () => {
  it("앞뒤 공백을 걷는다", () => {
    expect(parseQuestion("  배추 물주기  ")).toEqual({
      ok: true,
      value: "배추 물주기",
    });
  });

  it("줄바꿈은 살린다 — 문단을 나눠 물을 수 있다", () => {
    expect(parseQuestion("첫 줄\n둘째 줄")).toEqual({
      ok: true,
      value: "첫 줄\n둘째 줄",
    });
  });

  it("공백만 보내면 거절한다 — 보내면 하루 횟수만 깎인다", () => {
    expect(parseQuestion("   ").ok).toBe(false);
    expect(parseQuestion("").ok).toBe(false);
  });

  it("문자열이 아니면 거절한다", () => {
    expect(parseQuestion(undefined).ok).toBe(false);
    expect(parseQuestion(123).ok).toBe(false);
  });

  it("상한까지는 통과하고 한 자 넘으면 막는다", () => {
    expect(parseQuestion("가".repeat(QUESTION_MAX_LENGTH)).ok).toBe(true);
    expect(parseQuestion("가".repeat(QUESTION_MAX_LENGTH + 1)).ok).toBe(false);
  });
});

describe("parsePlotId", () => {
  it("고르지 않았으면 null", () => {
    expect(parsePlotId("")).toBeNull();
    expect(parsePlotId("   ")).toBeNull();
    expect(parsePlotId(null)).toBeNull();
  });

  it("값이 있으면 공백만 걷어 그대로 넘긴다", () => {
    expect(parsePlotId(" abc ")).toBe("abc");
  });
});
