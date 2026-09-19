import { describe, expect, it } from "vitest";
import { hasTransplantWord, isTransplantMethod } from "./transplant";

describe("isTransplantMethod — sow_method 는 정확히 같은지로 본다", () => {
  it("옮겨심기 작업이면 참", () => {
    expect(isTransplantMethod("아주심기")).toBe(true);
    expect(isTransplantMethod("정식")).toBe(true);
    expect(isTransplantMethod("모내기")).toBe(true);
    expect(isTransplantMethod("이앙")).toBe(true);
  });

  it("씨 쪽 낱말은 거짓 — 이 목록의 뜻은 '자란 모를 옮긴다' 하나다", () => {
    expect(isTransplantMethod("씨뿌림")).toBe(false);
    expect(isTransplantMethod("파종")).toBe(false);
    expect(isTransplantMethod("육묘")).toBe(false);
    expect(isTransplantMethod("모기르기")).toBe(false);
    // 참다래. 파종이 아니라 꽃가루받이다
    expect(isTransplantMethod("인공수분")).toBe(false);
  });

  it("빈 값과 없는 값은 거짓이다 — 모르는 것을 옮겨심기로 보지 않는다", () => {
    expect(isTransplantMethod("")).toBe(false);
    expect(isTransplantMethod(null)).toBe(false);
    expect(isTransplantMethod(undefined)).toBe(false);
  });

  it("앞뒤 공백은 떼고 본다", () => {
    expect(isTransplantMethod(" 아주심기 ")).toBe(true);
  });

  it("다른 말이 붙으면 거짓이다 — sow_method 는 대표 작업명 하나다", () => {
    expect(isTransplantMethod("아주심기, 웃거름")).toBe(false);
  });
});

describe("hasTransplantWord — stage_name 은 들어 있는지로 본다", () => {
  it("다른 말이 붙어 있어도 찾는다", () => {
    expect(hasTransplantWord("아주심기, 웃거름, 김매기")).toBe(true);
    expect(hasTransplantWord("모내기때")).toBe(true);
    // 사료용 벼. 이 둘이 안 걸려 이식 보정을 못 받고 있었다(2026-09-19)
    expect(hasTransplantWord("이앙활착기")).toBe(true);
    expect(hasTransplantWord("이앙<br />활착기")).toBe(true);
  });

  it("생육 단계 이름은 거짓", () => {
    expect(hasTransplantWord("발아, 어린 모 시기")).toBe(false);
    expect(hasTransplantWord("결구기")).toBe(false);
    expect(hasTransplantWord("수확")).toBe(false);
  });

  it("빈 값과 없는 값은 거짓", () => {
    expect(hasTransplantWord("")).toBe(false);
    expect(hasTransplantWord(null)).toBe(false);
  });
});
