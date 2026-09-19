import { describe, expect, it } from "vitest";
import {
  MAX_CROPS,
  pickBannerItem,
  toBannerLine,
  toSowingLine,
  toVegetationItem,
  type VegetationItem,
} from "./vegetationBanner";

/**
 * ⚠ 실측값을 그대로 쓴다(2026-09-19 · 사용자 밭 5곳). 기준이 어긋나면
 *   이 줄들이 먼저 깨진다.
 */

const 자라는논 = [
  { date: "2026-09-05", ndvi: 0.7, ndmi: 0.423 },
  { date: "2026-09-18", ndvi: 0.727, ndmi: 0.344 },
];
const 밭아님 = [{ date: "2026-09-08", ndvi: -0.107, ndmi: -0.353 }];

function 항목(over: Partial<VegetationItem> = {}): VegetationItem {
  return {
    plotNameKo: "밭",
    bodyKo: "잎이 빽빽하게 덮였어요.",
    observedOnKo: "09-18",
    urgent: false,
    ...over,
  };
}

describe("toVegetationItem", () => {
  it("실측값이 한 줄이 된다", () => {
    const item = toVegetationItem({
      plotNameKo: "아빠 논1번",
      points: 자라는논,
    });
    expect(item?.bodyKo).toContain("빽빽");
    expect(item?.observedOnKo).toBe("09-18");
    expect(item?.urgent).toBe(false);
  });

  it("좌표가 밭이 아니면 급한 줄이다", () => {
    // 모르고 지나가면 그 밭의 값이 통째로 틀린 채로 남는다
    const item = toVegetationItem({ plotNameKo: "설화고", points: 밭아님 });
    expect(item?.urgent).toBe(true);
    expect(item?.bodyKo).toContain("밭 위치");
  });

  it("물기가 준 것은 급한 것이 아니다", () => {
    // 익어 가는 밭은 잎이 마르는 게 정상이다. 급한 칸에 넣으면 멀쩡한 밭이
    // 늘 걱정거리로 뜬다(실측: 밭 5개 중 2개가 그랬다)
    const item = toVegetationItem({
      plotNameKo: "아빠 논1번",
      points: 자라는논,
    });
    expect(item?.bodyKo).toContain("줄었");
    expect(item?.urgent).toBe(false);
  });

  it("익어 가는 단계면 정상이라고 말해 준다", () => {
    const item = toVegetationItem({
      plotNameKo: "아빠 논1번",
      points: 자라는논,
      stageNameKo: "수확할때",
    });
    expect(item?.bodyKo).toContain("자연스러운");
    expect(item?.bodyKo).not.toContain("줄었");
  });

  it("관측이 없으면 줄을 안 만든다", () => {
    expect(toVegetationItem({ plotNameKo: "밭", points: [] })).toBeNull();
  });

  it("밭 이름이 없으면 줄을 안 만든다", () => {
    // "이름 없는 밭이 …" 는 어느 밭인지 못 알려 줘 할 수 있는 일이 없다
    expect(toVegetationItem({ plotNameKo: null, points: 자라는논 })).toBeNull();
    expect(toVegetationItem({ plotNameKo: "  ", points: 자라는논 })).toBeNull();
  });
});

describe("pickBannerItem — 급한 것 하나", () => {
  const 급함 = 항목({ plotNameKo: "설화고", urgent: true });
  const 보통들 = [
    항목({ plotNameKo: "가밭" }),
    항목({ plotNameKo: "나밭" }),
    항목({ plotNameKo: "다밭" }),
  ];

  it("급한 것이 있으면 그것만 보인다", () => {
    const 골랐다 = pickBannerItem([...보통들, 급함], new Date("2026-09-19"));
    expect(골랐다?.plotNameKo).toBe("설화고");
  });

  it("급하지 않은 줄은 안 보인다", () => {
    // "잎이 빽빽해요" 는 좋은 소식이라 한 줄을 차지할 값어치가 없다.
    // 그때는 부르는 쪽이 이 달에 심는 작물을 대신 보인다
    expect(pickBannerItem(보통들, new Date("2026-09-19"))).toBeNull();
  });

  it("급한 것이 여럿이면 날마다 돌아간다", () => {
    const 여럿 = [
      항목({ plotNameKo: "가밭", urgent: true }),
      항목({ plotNameKo: "나밭", urgent: true }),
      항목({ plotNameKo: "다밭", urgent: true }),
    ];
    const 하루 = (d: string) => pickBannerItem(여럿, new Date(d))?.plotNameKo;
    const 사흘 = [하루("2026-09-19"), 하루("2026-09-20"), 하루("2026-09-21")];
    expect(new Set(사흘).size).toBe(3);
  });

  it("같은 날에는 같은 밭이 뜬다", () => {
    // 새로고침마다 바뀌면 "아까 그 글 뭐였지" 하고 못 찾는다
    const 여럿 = [
      항목({ plotNameKo: "가밭", urgent: true }),
      항목({ plotNameKo: "나밭", urgent: true }),
    ];
    const 아침 = pickBannerItem(여럿, new Date("2026-09-19T01:00:00Z"));
    const 저녁 = pickBannerItem(여럿, new Date("2026-09-19T22:00:00Z"));
    expect(아침?.plotNameKo).toBe(저녁?.plotNameKo);
  });

  it("달을 넘어도 번호가 1로 안 돌아간다", () => {
    // getDate() 로 세면 31일 다음이 1일이라 같은 밭이 이어서 두 번 뜬다
    const 여럿 = [
      항목({ plotNameKo: "가밭", urgent: true }),
      항목({ plotNameKo: "나밭", urgent: true }),
    ];
    const 말일 = pickBannerItem(여럿, new Date("2026-10-31"))?.plotNameKo;
    const 첫날 = pickBannerItem(여럿, new Date("2026-11-01"))?.plotNameKo;
    expect(말일).not.toBe(첫날);
  });

  it("보일 것이 없으면 null", () => {
    expect(pickBannerItem([], new Date("2026-09-19"))).toBeNull();
  });
});

describe("toSowingLine — 급한 것이 없는 날", () => {
  it("이 달에 흔히 심는 것을 늘어놓는다", () => {
    // 2026-09-19 실측: 시금치·양파·고사리·프리지아
    expect(toSowingLine(["시금치", "양파", "고사리"], 9)).toBe(
      "9월에 흔히 심는 것 — 시금치 · 양파 · 고사리. 지역에 따라 열흘쯤 차이가 납니다.",
    );
  });

  it('"지금 심으세요" 라고 하지 않는다', () => {
    // 파종 시기는 남부·중부가 열흘 넘게 갈리는데 마스터에 지역 구분이 없다
    const 말 = toSowingLine(["시금치"], 9) ?? "";
    expect(말).toContain("지역에 따라");
    expect(말).not.toContain("심으세요");
  });

  it("너무 많으면 자른다", () => {
    const 말 = toSowingLine(["가", "나", "다", "라", "마", "바"], 3) ?? "";
    expect(말.split(" · ")).toHaveLength(MAX_CROPS);
  });

  it("심을 것이 없으면 null", () => {
    expect(toSowingLine([], 1)).toBeNull();
    expect(toSowingLine(["  "], 1)).toBeNull();
  });
});

describe("toBannerLine", () => {
  it("밭 이름 · 몸말 · 관측일 순이다", () => {
    expect(toBannerLine(항목({ plotNameKo: "아빠 논1번" }))).toBe(
      "아빠 논1번 · 잎이 빽빽하게 덮였어요. · 09-18 위성 관측",
    );
  });

  it("관측일을 모르면 꼬리를 안 붙인다", () => {
    expect(toBannerLine(항목({ observedOnKo: null }))).toBe(
      "밭 · 잎이 빽빽하게 덮였어요.",
    );
  });
});
