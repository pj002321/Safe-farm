import { describe, expect, it } from "vitest";
import {
  buildFruitCycle,
  fruitOriginDate,
  isFruit,
  windowMidMmDd,
  yearsSincePlanting,
} from "./fruitOrigin";

/**
 * ★ 이 파일이 지키는 것은 넷이다. **파이썬의 `tests/test_fruit_gdd_origin.py`
 *   와 같은 네 가지**다 — 규칙이 두 벌이라 검사도 두 벌이다.
 *
 *   ① 과수는 심은 날이 아니라 그 해 기점부터 쌓는다
 *   ② 기점은 창의 **중앙일**이다 (crop-data 의 기준일과 같아야 한다)
 *   ③ 올해 기점이 아직이면 **작년 기점**부터다
 *   ④ 한해살이는 하나도 안 바뀐다
 */

const 사과 = { sowMethod: "발아", sowFrom: "03-15", sowTo: "04-05" };
const 매실 = { sowMethod: "개화", sowFrom: "03-05", sowTo: "04-05" };
const 시금치 = { sowMethod: "씨뿌림", sowFrom: "09-11", sowTo: "11-30" };

describe("isFruit", () => {
  it("기점 낱말이면 과수다", () => {
    expect(isFruit("발아")).toBe(true);
    expect(isFruit("개화")).toBe(true);
  });

  it("앞뒤 공백은 벗긴다 — 파이썬 is_fruit 도 .strip() 한다", () => {
    // ⚠ 한쪽만 벗기면 `" 개화 "` 에서 화면은 과수로 보고 서버는 아니라고 본다.
    //   게이지와 할 일 카드가 서로 다른 기준으로 돌게 된다 (2026-09-21 맞춤)
    for (const m of [" 발아", "개화 ", "  발아  ", "\t개화\n"]) {
      expect(isFruit(m)).toBe(true);
    }
  });

  it("심는 말이면 과수가 아니다", () => {
    // ⚠ '인공수분'(참다래의 옛 값)도 과수가 아니다 — 농작업이지 기점이 아니다
    for (const m of ["씨뿌림", "아주심기", "모기르기", "인공수분", "", null]) {
      expect(isFruit(m)).toBe(false);
    }
  });
});

describe("windowMidMmDd", () => {
  it("창의 가운데를 쓴다 — crop-data 의 기준일과 같아야 한다", () => {
    // ② 사과 03-15~04-05 → 03-25. 파이썬 `_중앙일` 과 같은 값이다
    expect(windowMidMmDd("03-15", "04-05")).toEqual([3, 25]);
    expect(windowMidMmDd("04-05", "04-15")).toEqual([4, 10]);
  });

  it("한쪽만 있으면 그쪽을 쓴다", () => {
    expect(windowMidMmDd("03-15", null)).toEqual([3, 15]);
    expect(windowMidMmDd(null, "04-05")).toEqual([4, 5]);
  });

  it("창이 비면 없다", () => {
    expect(windowMidMmDd(null, null)).toBeNull();
    expect(windowMidMmDd("", "")).toBeNull();
  });

  it("⚠ 달력에 없는 날은 버린다 — 범위 검사만으로는 02-30 이 샌다", () => {
    // 이 검사가 지키는 것: parseMmDd 를 `day <= 31` 로 되돌리면 02-30 이 통과해
    // Date.UTC 가 3월 2일로 조용히 굴러간다. 마스터가 그런 값을 줄 때 화면이
    // 엉뚱한 기점을 쓰게 된다
    expect(windowMidMmDd("13-01", "13-05")).toBeNull();
    expect(windowMidMmDd("04-32", "04-33")).toBeNull();
    expect(windowMidMmDd("02-30", "03-05")).toEqual([3, 5]); // 한쪽만 버리고 남은 쪽을 쓴다
    expect(windowMidMmDd("02-29", "03-05")).toEqual([3, 2]); // 윤년은 받는다
  });

  it("해를 넘는 창도 가운데를 낸다", () => {
    // 지금 과수엔 없지만 막아 둔다
    expect(windowMidMmDd("12-25", "01-05")).toEqual([12, 30]);
  });
});

describe("fruitOriginDate", () => {
  it("기점이 지났으면 올해다", () => {
    expect(fruitOriginDate(사과, "2026-09-20")).toBe("2026-03-25");
  });

  it("기점이 아직이면 작년이다", () => {
    // ③ 감귤은 12월까지 따므로 작년 기점부터 이어져야 한다
    expect(fruitOriginDate(사과, "2026-01-10")).toBe("2025-03-25");
  });

  it("기점 당일이면 올해다", () => {
    expect(fruitOriginDate(사과, "2026-03-25")).toBe("2026-03-25");
  });

  it("개화 기점도 같은 규칙이다", () => {
    expect(fruitOriginDate(매실, "2026-09-20")).toBe("2026-03-20");
  });

  it("④ 한해살이는 null — 부르는 쪽이 파종일을 그대로 쓴다", () => {
    expect(fruitOriginDate(시금치, "2026-09-20")).toBeNull();
  });

  it("🔴 today 가 날짜 꼴이 아니면 null — 2026-09-21 버그 헌팅", () => {
    // Number("") 가 0 이라 isFinite 를 통과한다. 그래서 "-1-03-25" 가 나왔다.
    // "2026" 처럼 짧은 값도 조용히 작년 기점을 돌려줬다
    for (const t of ["", "2026", "오늘", "not-a-date", "26-09-20"]) {
      expect(fruitOriginDate(사과, t)).toBeNull();
    }
  });

  it("창이 빈 과수도 null — 옛 길로 떨어뜨린다", () => {
    const v = { sowMethod: "발아", sowFrom: null, sowTo: null };
    expect(fruitOriginDate(v, "2026-09-20")).toBeNull();
  });
});

describe("해가 바뀌면 다시 0 부터", () => {
  // ★ **과수는 선이 아니라 원이다.** 파이썬 쪽 같은 이름의 검사와 짝이다.
  //    실측 2026-09-21 — 단감(창 03-25~04-25, 기점 04-09) 누적이
  //    04-08 26.2 → 04-09 **0.0**, 단계도 첫 칸(발아전엽기)으로 돌아왔다.
  const 단감 = { sowMethod: "발아", sowFrom: "03-25", sowTo: "04-25" };

  it("기점 하루 전까지는 작년 기점이다", () => {
    // 여기가 어긋나면 한겨울에 누적이 0 으로 떨어져 게이지가 처음으로 되감긴다.
    // 1월에 감귤을 따는 사람이 그것을 본다
    expect(fruitOriginDate(단감, "2027-04-08")).toBe("2026-04-09");
    expect(fruitOriginDate(단감, "2027-01-10")).toBe("2026-04-09");
  });

  it("🔴 기점 당일에 다음 바퀴가 시작된다 — 누적이 0 으로 돌아가는 자리", () => {
    // 쌓을 구간이 0일이 되어 누적도 0 이 된다. 따로 지우는 코드가 없는 까닭이다
    expect(fruitOriginDate(단감, "2027-04-09")).toBe("2027-04-09");
    expect(fruitOriginDate(단감, "2027-04-10")).toBe("2027-04-09");
  });

  it("개화 기점도 해마다 되감긴다 — 기점 낱말은 둘이다", () => {
    // ⚠ 발아만 되감기면 개화 4품종만 영영 심은 날부터 세게 된다
    expect(fruitOriginDate(매실, "2027-03-19")).toBe("2026-03-20");
    expect(fruitOriginDate(매실, "2027-03-20")).toBe("2027-03-20");
  });

  it("바퀴가 여러 해 돌아도 기점은 같은 날이다", () => {
    for (const 해 of [2026, 2027, 2028, 2029]) {
      expect(fruitOriginDate(단감, `${해}-09-20`)).toBe(`${해}-04-09`);
    }
  });

  it("윤년에도 기점이 안 밀린다", () => {
    // ⚠ 2028 은 윤년이다. 2월이 기점인 무화과는 윤일 당일도 받아야 한다
    expect(fruitOriginDate(단감, "2028-09-20")).toBe("2028-04-09");
    const 무화과 = { sowMethod: "발아", sowFrom: "02-15", sowTo: "02-25" };
    expect(fruitOriginDate(무화과, "2028-02-29")).toBe("2028-02-20");
  });

  it("다음 바퀴의 기점을 미리 말한다 — 화면이 '언제 다시 세나' 를 쓴다", () => {
    const c = buildFruitCycle(
      { ...단감, sowingDate: "2021-04-01" },
      "2026-09-21",
      2084,
      2186,
    );
    expect(c?.originOn).toBe("2026-04-09");
    expect(c?.nextOriginOn).toBe("2027-04-09");
  });
});

describe("yearsSincePlanting", () => {
  it("① 5년 전에 심었으면 6년차다", () => {
    expect(yearsSincePlanting(사과, "2021-04-01", "2026-09-20")).toBe(6);
  });

  it("심은 해면 1년차다", () => {
    expect(yearsSincePlanting(사과, "2026-04-01", "2026-09-20")).toBe(1);
  });

  it("④ 한해살이는 null — sowing_date 가 곧 그 해의 시작이라 뜻이 없다", () => {
    expect(yearsSincePlanting(시금치, "2026-08-15", "2026-09-20")).toBeNull();
  });

  it("심은 날을 모르면 null", () => {
    expect(yearsSincePlanting(사과, null, "2026-09-20")).toBeNull();
  });

  it("🔴 심은 날이 미래거나 꼴이 아니면 null — 2026-09-21 버그 헌팅", () => {
    // 전에는 "2030-01-01" 이 -3 을, "" 가 2027 을 돌려줬다. 화면에 그대로 찍힌다
    expect(yearsSincePlanting(사과, "2030-01-01", "2026-09-20")).toBeNull();
    expect(yearsSincePlanting(사과, "", "2026-09-20")).toBeNull();
    expect(yearsSincePlanting(사과, "헛소리", "2026-09-20")).toBeNull();
    // 심은 해면 1년차 — 경계는 살아 있어야 한다
    expect(yearsSincePlanting(사과, "2026-01-01", "2026-09-20")).toBe(1);
  });
});

describe("buildFruitCycle", () => {
  const 사과심음 = { ...사과, sowingDate: "2021-04-01" };

  it("한 바퀴를 말한다 — 올해 기점과 다음 기점", () => {
    const c = buildFruitCycle(사과심음, "2026-09-20", 1000, 3607);
    expect(c).not.toBeNull();
    expect(c?.originOn).toBe("2026-03-25");
    expect(c?.nextOriginOn).toBe("2027-03-25");
    expect(c?.originKind).toBe("발아");
    expect(c?.years).toBe(6);
  });

  it("목표를 넘겼으면 수확 뒤다", () => {
    // ⚠ 이것이 참이어야 화면이 "자료가 없습니다" 대신 "올해 수확이 끝났습니다" 를 쓴다
    expect(
      buildFruitCycle(사과심음, "2026-09-20", 3700, 3607)?.afterHarvest,
    ).toBe(true);
    expect(
      buildFruitCycle(사과심음, "2026-09-20", 3000, 3607)?.afterHarvest,
    ).toBe(false);
  });

  it("목표를 모르면 수확 뒤라고 하지 않는다", () => {
    // 분모 없는 판단은 거짓 숫자가 된다
    expect(
      buildFruitCycle(사과심음, "2026-09-20", 9999, null)?.afterHarvest,
    ).toBe(false);
  });

  it("④ 한해살이는 null — 화면이 이 칸으로 갈래를 판다", () => {
    const v = { ...시금치, sowingDate: "2026-08-15" };
    expect(buildFruitCycle(v, "2026-09-20", 500, 900)).toBeNull();
  });
});
