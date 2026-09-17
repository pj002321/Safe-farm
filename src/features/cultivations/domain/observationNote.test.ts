import { describe, expect, it } from "vitest";
import { NOTE_MAX_LENGTH, parseNote } from "./observationNote";

const TODAY = "2026-09-17";

describe("parseNote", () => {
  it("앞뒤 공백을 떼고 통과한다", () => {
    const result = parseNote({
      body: "  잎에 구멍  ",
      occurredOn: TODAY,
      today: TODAY,
    });

    expect(result).toEqual({
      ok: true,
      value: { body: "잎에 구멍", occurredOn: TODAY },
    });
  });

  it("본문이 비면 막는다", () => {
    const result = parseNote({ body: "   ", occurredOn: TODAY, today: TODAY });

    expect(result.ok).toBe(false);
  });

  it("본문이 아예 없으면 막는다", () => {
    const result = parseNote({ occurredOn: TODAY, today: TODAY });

    expect(result.ok).toBe(false);
  });

  it("앞으로의 날짜는 막는다", () => {
    const result = parseNote({
      body: "메모",
      occurredOn: "2026-09-18",
      today: TODAY,
    });

    expect(result.ok).toBe(false);
  });

  it("날짜 형식이 아니면 막는다", () => {
    const result = parseNote({
      body: "메모",
      occurredOn: "2026/09/17",
      today: TODAY,
    });

    expect(result.ok).toBe(false);
  });

  it("상한을 넘는 메모는 막는다", () => {
    const result = parseNote({
      body: "가".repeat(NOTE_MAX_LENGTH + 1),
      occurredOn: TODAY,
      today: TODAY,
    });

    expect(result.ok).toBe(false);
  });

  it("상한 딱 맞으면 통과한다", () => {
    const result = parseNote({
      body: "가".repeat(NOTE_MAX_LENGTH),
      occurredOn: TODAY,
      today: TODAY,
    });

    expect(result.ok).toBe(true);
  });
});
