import { describe, expect, it } from "vitest";
import { evaluateHazards, HAZARD_RULES, type HazardInput } from "./hazard";

/** 오늘 상주 배추밭의 실제 상황. */
const TODAY: HazardInput = {
  rain7Mm: 0.1,
  tempMaxC: 28.8,
  tempMinC: 15.0,
  stageKo: "생육",
};

describe("evaluateHazards", () => {
  it("오늘은 가을가뭄이 발동한다 — 이 화면의 출발점", () => {
    const fired = evaluateHazards(HAZARD_RULES, TODAY);
    expect(fired.map((f) => f.id)).toEqual(["autumn-drought"]);
  });

  it("발동 근거를 사람이 읽을 수 있게 함께 돌려준다", () => {
    // "가을가뭄입니다"만 보여주면 사용자가 왜인지 모른다. 근거가 붙어야
    // 농민이 자기 밭 상황과 대조해 판단할 수 있다.
    const [drought] = evaluateHazards(HAZARD_RULES, TODAY);
    expect(drought.becauseKo).toContain("0.1mm");
    expect(drought.becauseKo).toContain("5mm");
  });

  it("처방은 농진청 대책표에서 온다", () => {
    const [drought] = evaluateHazards(HAZARD_RULES, TODAY);
    expect(drought.actionsKo.length).toBeGreaterThan(0);
    expect(drought.sourceKo).toContain("농촌진흥청");
  });

  it("비가 충분하면 가뭄이 발동하지 않는다", () => {
    const wet = { ...TODAY, rain7Mm: 42 };
    expect(evaluateHazards(HAZARD_RULES, wet)).toEqual([]);
  });

  it("경계값 5mm 는 발동하지 않는다 (미만이 조건)", () => {
    expect(evaluateHazards(HAZARD_RULES, { ...TODAY, rain7Mm: 5 })).toEqual([]);
    expect(
      evaluateHazards(HAZARD_RULES, { ...TODAY, rain7Mm: 4.9 }),
    ).toHaveLength(1);
  });

  it("결구기 고온은 단계가 '결구' 일 때만 발동한다", () => {
    // 같은 28.8℃ 라도 생육기엔 문제가 아니고 결구기엔 속이 헐거워진다.
    // 단계를 안 보면 멀쩡한 밭에 경보가 뜬다.
    const growing = evaluateHazards(HAZARD_RULES, { ...TODAY, rain7Mm: 42 });
    expect(growing.map((f) => f.id)).not.toContain("heading-heat");

    const heading = evaluateHazards(HAZARD_RULES, {
      ...TODAY,
      rain7Mm: 42,
      stageKo: "결구",
    });
    expect(heading.map((f) => f.id)).toContain("heading-heat");
  });

  it("한파는 -3℃ 이하에서 발동한다", () => {
    const cold = { ...TODAY, rain7Mm: 42, tempMinC: -3 };
    expect(evaluateHazards(HAZARD_RULES, cold).map((f) => f.id)).toContain(
      "freeze",
    );
    expect(
      evaluateHazards(HAZARD_RULES, { ...cold, tempMinC: -2.9 }).map(
        (f) => f.id,
      ),
    ).not.toContain("freeze");
  });

  it("여러 재해가 동시에 발동할 수 있다", () => {
    const bad: HazardInput = {
      rain7Mm: 0,
      tempMaxC: 30,
      tempMinC: -5,
      stageKo: "결구",
    };
    expect(evaluateHazards(HAZARD_RULES, bad)).toHaveLength(3);
  });

  it("규칙은 입력을 바꾸지 않는다 (순수)", () => {
    const input = { ...TODAY };
    const snapshot = JSON.stringify(input);
    evaluateHazards(HAZARD_RULES, input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
