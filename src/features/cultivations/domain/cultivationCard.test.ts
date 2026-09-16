import { describe, expect, it } from "vitest";
import {
  type CultivationCard,
  type CultivationCardRow,
  cardTitle,
  sortCultivationCards,
  toCultivationCard,
} from "./cultivationCard";

function row(over: Partial<CultivationCardRow> = {}): CultivationCardRow {
  return {
    id: "c1",
    variant_id: 3,
    alias: null,
    status: "GROWING",
    sowing_date: "2026-09-01",
    sowing_type: "SEED",
    start_stage_order: null,
    harvested_at: null,
    created_at: "2026-09-01T00:00:00Z",
    crop_variants: {
      maturity_type: "MID",
      gdd_target: 797,
      days_to_harvest: 90,
      // numeric 은 supabase-js 가 문자열로 준다. 실제 응답 모양 그대로 둔다.
      crops: { name: "배추", base_temp: "5.0", upper_temp: "25.0" },
    },
    ...over,
  };
}

describe("toCultivationCard", () => {
  it("품종·작물을 타고 내려가 이름과 목표 GDD 를 꺼낸다", () => {
    const card = toCultivationCard(row());
    expect(card.cropNameKo).toBe("배추");
    expect(card.gddTarget).toBe(797);
    expect(card.maturityType).toBe("MID");
  });

  it("numeric 문자열을 숫자로 바꾼다", () => {
    // 문자열인 채로 계산에 들어가면 `"5.0" - 3` 같은 식이 조용히 섞인다.
    const card = toCultivationCard(row());
    expect(card.baseTempC).toBe(5);
    expect(card.upperTempC).toBe(25);
  });

  it("상한온도가 없는 작물은 null 이다 — 0 으로 채우지 않는다", () => {
    // 0 으로 채우면 상한 0℃ 로 잘려 GDD 가 전부 0 이 된다.
    const card = toCultivationCard(
      row({
        crop_variants: {
          maturity_type: "MID",
          gdd_target: 797,
          days_to_harvest: null,
          crops: { name: "감자", base_temp: "5.0", upper_temp: null },
        },
      }),
    );
    expect(card.upperTempC).toBeNull();
  });

  it("중첩 select 가 배열로 와도 읽는다", () => {
    // PostgREST 는 다대일도 배열로 줄 때가 있다. 배열로만 읽으면 이름이
    // 조용히 null 로 떨어진다.
    const card = toCultivationCard(
      row({
        crop_variants: [
          {
            maturity_type: "EARLY",
            gdd_target: 500,
            days_to_harvest: 60,
            crops: [{ name: "상추", base_temp: "4.0", upper_temp: "25.0" }],
          },
        ],
      }),
    );
    expect(card.cropNameKo).toBe("상추");
    expect(card.gddTarget).toBe(500);
  });

  it("품종이 안 딸려 오면 게이지 값이 null 이다", () => {
    const card = toCultivationCard(row({ crop_variants: null }));
    expect(card.gddTarget).toBeNull();
    expect(card.baseTempC).toBeNull();
  });
});

describe("cardTitle", () => {
  it("별칭이 있으면 별칭을 쓴다", () => {
    const card = toCultivationCard(row({ alias: "창가 상추" }));
    expect(cardTitle(card)).toBe("창가 상추");
  });

  it("별칭이 없으면 작물 이름", () => {
    expect(cardTitle(toCultivationCard(row()))).toBe("배추");
  });
});

describe("sortCultivationCards", () => {
  function card(over: Partial<CultivationCard>): CultivationCard {
    return { ...toCultivationCard(row()), ...over };
  }

  it("진행 중인 것이 위, 끝난 것이 아래", () => {
    const sorted = sortCultivationCards([
      card({ id: "harvested", status: "HARVESTED" }),
      card({ id: "growing", status: "GROWING" }),
      card({ id: "planned", status: "PLANNED" }),
    ]);
    expect(sorted.map((c) => c.id)).toEqual([
      "growing",
      "planned",
      "harvested",
    ]);
  });

  it("같은 상태면 먼저 심은 것이 위", () => {
    const sorted = sortCultivationCards([
      card({ id: "late", sowingDate: "2026-09-10" }),
      card({ id: "early", sowingDate: "2026-08-20" }),
    ]);
    expect(sorted.map((c) => c.id)).toEqual(["early", "late"]);
  });

  it("파종일을 모르는 건은 뒤로", () => {
    const sorted = sortCultivationCards([
      card({ id: "unknown", sowingDate: null }),
      card({ id: "dated", sowingDate: "2026-09-10" }),
    ]);
    expect(sorted.map((c) => c.id)).toEqual(["dated", "unknown"]);
  });

  it("입력 배열을 건드리지 않는다", () => {
    const input = [
      card({ id: "b", status: "HARVESTED" }),
      card({ id: "a", status: "GROWING" }),
    ];
    sortCultivationCards(input);
    expect(input.map((c) => c.id)).toEqual(["b", "a"]);
  });
});
