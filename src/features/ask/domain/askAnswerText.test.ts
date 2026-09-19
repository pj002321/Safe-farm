import { describe, expect, it } from "vitest";
import { hideCitations } from "./askAnswerText";

describe("hideCitations", () => {
  it("문장 끝의 인라인 각주를 앞 공백째 지운다", () => {
    expect(
      hideCitations(
        "감자는 서늘한 기후를 좋아한다. [주간농사정보 · 2024 9 감자 재배]",
      ),
    ).toBe("감자는 서늘한 기후를 좋아한다.");
  });

  it("여러 개도 전부 지운다", () => {
    expect(hideCitations("첫 문장.[A] 둘째 문장.[B]")).toBe(
      "첫 문장. 둘째 문장.",
    );
  });

  it("닫히지 않은 대괄호는 스트리밍 중일 수 있으니 남긴다", () => {
    expect(hideCitations("문장 중간에 [아직 닫히지")).toBe(
      "문장 중간에 [아직 닫히지",
    );
  });

  it("각주가 없으면 그대로 돌려준다", () => {
    expect(hideCitations("각주 없는 평범한 답변")).toBe(
      "각주 없는 평범한 답변",
    );
  });
});
