import { describe, expect, it } from "vitest";
import {
  FAILURE_REASONS,
  failureReasonKo,
  parseFailureReason,
} from "./failureReason";

describe("FAILURE_REASONS", () => {
  it("코드가 겹치지 않는다", () => {
    const codes = FAILURE_REASONS.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("마이그레이션 체크 제약과 같은 목록이다", () => {
    // 여기만 늘리면 저장 시점에 ck_cultivations_failure_reason 이 막는다.
    expect(FAILURE_REASONS.map((r) => r.code)).toEqual([
      "PEST",
      "DISEASE",
      "WEATHER",
      "WATER",
      "NUTRIENT",
      "SEED",
      "MANAGE",
      "OTHER",
    ]);
  });

  it("기타가 맨 뒤다", () => {
    expect(FAILURE_REASONS.at(-1)?.code).toBe("OTHER");
  });
});

describe("failureReasonKo", () => {
  it("코드를 화면 문구로 바꾼다", () => {
    expect(failureReasonKo("PEST")).toBe("병해충");
  });

  it("사유가 없으면 빈칸 대신 쓸 말을 준다", () => {
    expect(failureReasonKo(null)).toBe("사유 미기재");
  });

  it("모르는 코드는 기타로 보인다", () => {
    expect(failureReasonKo("ALIEN")).toBe("기타");
  });
});

describe("parseFailureReason", () => {
  it("목록에 있으면 코드로 통과한다", () => {
    expect(parseFailureReason("WEATHER")).toBe("WEATHER");
  });

  it("앞뒤 공백은 떼고 본다", () => {
    expect(parseFailureReason("  SEED  ")).toBe("SEED");
  });

  it("모르는 값은 OTHER 가 아니라 null 이다", () => {
    // 폼이 깨진 것과 사용자가 기타를 고른 것은 다른 일이다.
    expect(parseFailureReason("ALIEN")).toBeNull();
  });

  it("문자열이 아니면 null", () => {
    expect(parseFailureReason(null)).toBeNull();
    expect(parseFailureReason(3)).toBeNull();
  });
});
