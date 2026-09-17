import { describe, expect, it } from "vitest";
import {
  type CropOptionRow,
  toCropOption,
  toDifficultyLevel,
  toDurationKo,
} from "./cropOption";

describe("toDifficultyLevel", () => {
  it("한글 난이도를 점 개수로 바꾼다", () => {
    expect(toDifficultyLevel("쉬움")).toBe(1);
    expect(toDifficultyLevel("보통")).toBe(2);
    expect(toDifficultyLevel("어려움")).toBe(3);
  });

  it("모르는 값과 null은 보통으로 본다", () => {
    expect(toDifficultyLevel("아주쉬움")).toBe(2);
    expect(toDifficultyLevel(null)).toBe(2);
  });
});

describe("toDurationKo", () => {
  it("품종이 하나면 약 N일이다", () => {
    expect(toDurationKo([{ days_to_harvest: 80 }])).toBe("약 80일");
  });

  it("품종이 여럿이면 범위로 접는다", () => {
    const days = [{ days_to_harvest: 95 }, { days_to_harvest: 80 }];
    expect(toDurationKo(days)).toBe("80~95일");
  });

  it("값이 같으면 범위로 벌리지 않는다", () => {
    const days = [{ days_to_harvest: 80 }, { days_to_harvest: 80 }];
    expect(toDurationKo(days)).toBe("약 80일");
  });

  it("품종이 없거나 일수가 비면 null이다 — 약 0일은 사실이 아니다", () => {
    expect(toDurationKo([])).toBeNull();
    expect(toDurationKo([{ days_to_harvest: null }])).toBeNull();
  });
});

describe("toCropOption", () => {
  const row: CropOptionRow = {
    crop_id: 5,
    name: "배추",
    difficulty: "보통",
    crop_variants: [{ days_to_harvest: 80 }, { days_to_harvest: 95 }],
  };

  it("행을 카드 값으로 좁힌다", () => {
    expect(toCropOption(row)).toEqual({
      cropId: 5,
      nameKo: "배추",
      difficultyLevel: 2,
      difficultyKo: "보통",
      durationKo: "80~95일",
    });
  });

  it("난이도가 비면 보통으로 채운다", () => {
    const option = toCropOption({ ...row, difficulty: null });
    expect(option.difficultyKo).toBe("보통");
    expect(option.difficultyLevel).toBe(2);
  });
});
