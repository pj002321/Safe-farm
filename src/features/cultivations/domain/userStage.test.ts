import { describe, expect, it } from "vitest";
import { parseUserStage, USER_STAGE_NAME_MAX_LENGTH } from "./userStage";

describe("parseUserStage", () => {
  it("이름과 날짜를 다듬어 돌려준다", () => {
    const result = parseUserStage({
      nameKo: "  말림  ",
      occurredOn: "2026-10-05",
    });

    expect(result).toEqual({
      ok: true,
      value: { nameKo: "말림", occurredOn: "2026-10-05" },
    });
  });

  it("앞날짜를 받는다 — 언제 할 것인가를 미리 적을 수 있다", () => {
    const result = parseUserStage({
      nameKo: "가공",
      occurredOn: "2099-01-01",
    });

    expect(result.ok).toBe(true);
  });

  it("이름이 비면 막는다 — 타임라인에 이름 없는 점이 생긴다", () => {
    for (const nameKo of ["", "   ", undefined, 7]) {
      const result = parseUserStage({ nameKo, occurredOn: "2026-10-05" });
      expect(result.ok).toBe(false);
    }
  });

  it("날짜 꼴이 아니면 막는다", () => {
    for (const occurredOn of ["", "2026-9-5", "어제", undefined]) {
      const result = parseUserStage({ nameKo: "말림", occurredOn });
      expect(result.ok).toBe(false);
    }
  });

  it("이름이 상한을 넘으면 막는다", () => {
    const result = parseUserStage({
      nameKo: "가".repeat(USER_STAGE_NAME_MAX_LENGTH + 1),
      occurredOn: "2026-10-05",
    });

    expect(result.ok).toBe(false);
  });
});
