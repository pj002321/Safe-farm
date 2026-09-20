import { describe, expect, it } from "vitest";
import {
  type CropOptionRow,
  isSowingSeason,
  toCropOption,
  toDifficultyLevel,
  toDurationKo,
  toSowingWindowKo,
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

describe("toSowingWindowKo", () => {
  it("품종이 하나면 그 창을 한 문장으로", () => {
    const v = [{ sow_method: "파종", sow_from: "03-01", sow_to: "03-31" }];
    expect(toSowingWindowKo(v)).toBe("3.1~3.31에 씨를 뿌립니다");
  });

  it("품종이 여럿이면 가장 이른 시작 ~ 가장 늦은 끝", () => {
    const v = [
      { sow_method: "아주심기", sow_from: "04-01", sow_to: "04-20" },
      { sow_method: "아주심기", sow_from: "03-21", sow_to: "05-20" },
    ];
    expect(toSowingWindowKo(v)).toBe("3.21~5.20에 모종으로 심습니다");
  });

  it("해를 넘는 창은 그대로 쓴다 — 12.1~2.28 이 사실이다", () => {
    const v = [{ sow_method: "씨뿌림", sow_from: "12-01", sow_to: "02-28" }];
    expect(toSowingWindowKo(v)).toBe("12.1~2.28에 씨를 뿌립니다");
  });

  it("파종 방법이 비면 중립적으로 '심습니다'", () => {
    // ⚠ 2026-09-20 이후 과수는 여기 안 온다 — '발아'·'개화' 가 실려 온다(아래).
    //   빈 값은 이제 "방법을 모르는 작물" 뿐이다
    const v = [{ sow_method: null, sow_from: "03-01", sow_to: "03-31" }];
    expect(toSowingWindowKo(v)).toBe("3.1~3.31에 심습니다");
  });

  it("★ 과수는 사람이 하는 일이 아니라 나무에 일어나는 일로 말한다", () => {
    // 나무를 몇 해 전에 심었으므로 그 해의 0일은 파종이 아니라 기점이다.
    // sow_from~sow_to 가 가리키는 것도 파종 창이 아니라 기점 창이다
    // (crop-data `build._파종방법` · 실측: 발아 12종 · 개화 3종)
    expect(
      toSowingWindowKo([
        { sow_method: "발아", sow_from: "03-15", sow_to: "04-05" },
      ]),
    ).toBe("3.15~4.5에 싹이 틉니다");
    expect(
      toSowingWindowKo([
        { sow_method: "개화", sow_from: "03-05", sow_to: "04-05" },
      ]),
    ).toBe("3.5~4.5에 꽃이 핍니다");
  });

  it("⚠ 과수를 기본값에 맡기면 조사가 틀린다 — 그래서 따로 적었다", () => {
    // 이 검사가 지키는 것: 위 두 줄을 지우면 "발아을(를) 합니다" 가 된다
    const 말 = toSowingWindowKo([
      { sow_method: "발아", sow_from: "03-15", sow_to: "04-05" },
    ]);
    expect(말).not.toContain("을(를)");
  });

  it("농업 용어를 사람 말로 바꾼다", () => {
    const windowOf = (m: string) => [
      { sow_method: m, sow_from: "05-11", sow_to: "06-20" },
    ];
    expect(toSowingWindowKo(windowOf("모내기"))).toBe(
      "5.11~6.20에 모내기 합니다",
    );
    expect(toSowingWindowKo(windowOf("육묘"))).toBe(
      "5.11~6.20에 모를 기르기 시작합니다",
    );
    // 참다래. 파종이 아니라 꽃가루받이라 "심습니다" 로 뭉뚱그리면 틀린 말이 된다
    expect(toSowingWindowKo(windowOf("인공수분"))).toBe(
      "5.11~6.20에 인공수분을 합니다",
    );
  });

  it("모르는 방법은 지어내지 않고 그 말을 쓴다", () => {
    const v = [{ sow_method: "덩이심기", sow_from: "03-01", sow_to: "03-31" }];
    expect(toSowingWindowKo(v)).toBe("3.1~3.31에 덩이심기을(를) 합니다");
  });

  it("창이 없으면 null — '정보 없음' 을 띄우지 않는다", () => {
    expect(toSowingWindowKo([])).toBeNull();
    expect(
      toSowingWindowKo([{ sow_method: "파종", sow_from: null, sow_to: null }]),
    ).toBeNull();
  });
});

describe("isSowingSeason", () => {
  const potato = [{ sow_from: "03-01", sow_to: "03-31" }];
  const celery = [{ sow_from: "12-01", sow_to: "02-28" }];

  it("창 안이면 참, 밖이면 거짓", () => {
    expect(isSowingSeason("03-15", potato)).toBe(true);
    expect(isSowingSeason("04-10", potato)).toBe(false);
  });

  it("양 끝날은 포함이다", () => {
    expect(isSowingSeason("03-01", potato)).toBe(true);
    expect(isSowingSeason("03-31", potato)).toBe(true);
  });

  it("해를 넘는 창은 12·1·2월이 전부 안이다", () => {
    expect(isSowingSeason("12-15", celery)).toBe(true);
    expect(isSowingSeason("01-15", celery)).toBe(true);
    expect(isSowingSeason("02-20", celery)).toBe(true);
    expect(isSowingSeason("06-15", celery)).toBe(false);
  });

  it("품종이 여럿이면 하나라도 안이면 참", () => {
    const v = [
      { sow_from: "03-01", sow_to: "03-31" },
      { sow_from: "08-11", sow_to: "08-31" },
    ];
    expect(isSowingSeason("08-20", v)).toBe(true);
  });

  it("창이 없으면 거짓", () => {
    expect(isSowingSeason("03-15", [])).toBe(false);
    expect(isSowingSeason("03-15", [{ sow_from: null, sow_to: null }])).toBe(
      false,
    );
  });
});

describe("toCropOption", () => {
  const row: CropOptionRow = {
    crop_id: 5,
    name: "배추",
    difficulty: "보통",
    crop_variants: [
      {
        maturity_type: "EARLY",
        days_to_harvest: 80,
        sow_method: "아주심기",
        sow_from: "04-01",
        sow_to: "05-20",
        seed_from: "03-01",
        seed_to: "03-20",
        plant_from: "04-01",
        plant_to: "05-20",
      },
      {
        maturity_type: "MID",
        days_to_harvest: 95,
        sow_method: "아주심기",
        sow_from: "04-01",
        sow_to: "05-20",
        seed_from: "03-01",
        seed_to: "03-20",
        plant_from: "04-01",
        plant_to: "05-20",
      },
    ],
  };

  it("한쪽 창만 있으면 그쪽 문구만 — 없는 쪽은 null 이라 화면이 자리를 비운다", () => {
    // 감자·시금치는 직파라 옮 창이 없고, 딸기는 씨로 안 심어 씨 창이 없다
    const got = toCropOption(
      {
        ...row,
        crop_variants: [
          {
            ...row.crop_variants[0],
            plant_from: null,
            plant_to: null,
          },
        ],
      },
      "04-10",
    );
    expect(got.seedWindowKo).toBe("3.1~3.20에 씨를 뿌립니다");
    expect(got.plantWindowKo).toBeNull();
  });

  it("씨 쪽 작업명이 옮 창을 설명하지 않는다 — 벼의 '모기르기'", () => {
    // 이걸 그대로 쓰면 "5.15~6.15에 모를 기르기 시작합니다" 가 되어 앞뒤가 뒤집힌다
    const got = toCropOption(
      {
        ...row,
        crop_variants: [
          {
            ...row.crop_variants[0],
            sow_method: "모기르기",
            seed_from: "04-11",
            seed_to: "05-20",
            plant_from: "05-15",
            plant_to: "06-15",
          },
        ],
      },
      "04-10",
    );
    expect(got.seedWindowKo).toBe("4.11~5.20에 씨를 뿌립니다");
    expect(got.plantWindowKo).toBe("5.15~6.15에 모종으로 심습니다");
  });

  it("행을 카드 값으로 좁힌다", () => {
    expect(toCropOption(row, "04-10")).toEqual({
      cropId: 5,
      nameKo: "배추",
      difficultyLevel: 2,
      difficultyKo: "보통",
      durationKo: "80~95일",
      maturities: [
        { type: "EARLY", labelKo: "조생종", daysToHarvest: 80 },
        { type: "MID", labelKo: "중생종", daysToHarvest: 95 },
      ],
      seedWindowKo: "3.1~3.20에 씨를 뿌립니다",
      plantWindowKo: "4.1~5.20에 모종으로 심습니다",
      sowingNow: true,
    });
  });

  it("오늘이 창 밖이면 sowingNow 가 거짓", () => {
    expect(toCropOption(row, "09-18").sowingNow).toBe(false);
  });

  it("난이도가 비면 보통으로 채운다", () => {
    const option = toCropOption({ ...row, difficulty: null }, "04-10");
    expect(option.difficultyKo).toBe("보통");
    expect(option.difficultyLevel).toBe(2);
  });

  it("품종이 없으면 기간·창이 다 null 이고 배지도 안 뜬다", () => {
    const option = toCropOption({ ...row, crop_variants: [] }, "04-10");
    expect(option.durationKo).toBeNull();
    expect(option.seedWindowKo).toBeNull();
    expect(option.plantWindowKo).toBeNull();
    expect(option.sowingNow).toBe(false);
  });
});
