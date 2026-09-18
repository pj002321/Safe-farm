import { describe, expect, it } from "vitest";
import { seedlingStartStage } from "./seedlingStart";

/**
 * 값은 전부 2026-09-18 의 실제 crop_stages 에서 가져왔다. 지어낸 숫자로 재면
 * 문턱(0.4)이 실제 표를 어떻게 가르는지 확인이 안 된다.
 */
describe("seedlingStartStage", () => {
  it("배추 MID: 아주심기 106/742 = 14% 면 2", () => {
    expect(
      seedlingStartStage([
        { stage_order: 1, stage_name: "씨뿌림", gdd_from: 0, gdd_to: 106 },
        { stage_order: 2, stage_name: "아주심기, 웃거름, 김매기", gdd_from: 106, gdd_to: 209 },
        { stage_order: 3, stage_name: "결구기", gdd_from: 209, gdd_to: 742 },
      ]),
    ).toBe(2);
  });

  it("방울토마토: 아주심기가 1단계면 1 (보정 0 과 같다)", () => {
    expect(
      seedlingStartStage([
        { stage_order: 1, stage_name: "아주심기", gdd_from: 0, gdd_to: 272 },
        { stage_order: 2, stage_name: "수확", gdd_from: 272, gdd_to: 692 },
      ]),
    ).toBe(1);
  });

  it("결구상추: 3단계라도 332/1619 = 21% 면 믿는다", () => {
    // 아침 규칙(stage_order <= 2)이었다면 null 이 됐을 자리다.
    // 씨뿌림 → 모기르기 → 아주심기 로 단계가 하나 더 쪼개졌을 뿐이라 버리면 안 된다
    expect(
      seedlingStartStage([
        { stage_order: 1, stage_name: "씨뿌림", gdd_from: 0, gdd_to: 120 },
        { stage_order: 2, stage_name: "모기르기", gdd_from: 120, gdd_to: 332 },
        { stage_order: 3, stage_name: "아주심기", gdd_from: 332, gdd_to: 1619 },
      ]),
    ).toBe(3);
  });

  it("양파 MID: 아주심기 969/1085 = 89% 면 표를 의심하고 null", () => {
    expect(
      seedlingStartStage([
        { stage_order: 1, stage_name: "잎과 줄기 신장기", gdd_from: 0, gdd_to: 90 },
        { stage_order: 2, stage_name: "줄기비대기", gdd_from: 90, gdd_to: 969 },
        { stage_order: 3, stage_name: "아주심기", gdd_from: 969, gdd_to: 1085 },
      ]),
    ).toBeNull();
  });

  it("이식 단계가 없으면 null", () => {
    expect(
      seedlingStartStage([
        { stage_order: 1, stage_name: "파종", gdd_from: 0, gdd_to: 200 },
        { stage_order: 2, stage_name: "수확", gdd_from: 200, gdd_to: 900 },
      ]),
    ).toBeNull();
  });

  it("순서가 섞여 와도 stage_order 로 본다", () => {
    expect(
      seedlingStartStage([
        { stage_order: 2, stage_name: "정식", gdd_from: 100, gdd_to: 800 },
        { stage_order: 1, stage_name: "씨뿌림", gdd_from: 0, gdd_to: 100 },
      ]),
    ).toBe(2);
  });

  it("전체가 0 이면 나눗셈을 피하고 null", () => {
    expect(
      seedlingStartStage([{ stage_order: 1, stage_name: "아주심기", gdd_from: 0, gdd_to: 0 }]),
    ).toBeNull();
  });

  it("단계가 하나도 없으면 null", () => {
    expect(seedlingStartStage([])).toBeNull();
  });
});
