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

  it("창이 빈 과수도 null — 옛 길로 떨어뜨린다", () => {
    const v = { sowMethod: "발아", sowFrom: null, sowTo: null };
    expect(fruitOriginDate(v, "2026-09-20")).toBeNull();
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
