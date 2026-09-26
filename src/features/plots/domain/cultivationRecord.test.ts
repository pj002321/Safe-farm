import { describe, expect, it } from "vitest";
import {
  type CultivationRecord,
  type CultivationRecordRow,
  cultivationDays,
  filterByYear,
  groupByYear,
  toCultivationRecord,
  yearOf,
} from "./cultivationRecord";

function record(over: Partial<CultivationRecord> = {}): CultivationRecord {
  return {
    id: "r1",
    plotId: "p1",
    plotKo: "배추밭",
    cropKo: "배추",
    variantId: 1,
    sowingDate: "2026-08-20",
    endDate: "2026-11-05",
    endKind: "HARVESTED",
    yieldKg: 120,
    ...over,
  };
}

describe("yearOf", () => {
  it("파종이 아니라 끝난 해로 센다 — 해를 넘겨 거두는 작물이 있다", () => {
    const garlic = record({
      sowingDate: "2025-10-12",
      endDate: "2026-06-08",
    });
    expect(yearOf(garlic)).toBe(2026);
  });

  it("연초 날짜가 시간대 때문에 전년으로 밀리지 않는다", () => {
    // new Date("2026-01-01").getFullYear() 는 UTC 서쪽 환경에서 2025 가 된다.
    expect(yearOf(record({ endDate: "2026-01-01" }))).toBe(2026);
  });
});

describe("groupByYear", () => {
  it("최신 해가 먼저 온다", () => {
    const years = groupByYear([
      record({ id: "a", endDate: "2024-09-01" }),
      record({ id: "b", endDate: "2026-09-01" }),
      record({ id: "c", endDate: "2025-09-01" }),
    ]);
    expect(years.map((y) => y.year)).toEqual([2026, 2025, 2024]);
  });

  it("같은 해 안에서는 끝난 날 늦은 순이다", () => {
    const [year] = groupByYear([
      record({ id: "early", endDate: "2026-03-02" }),
      record({ id: "late", endDate: "2026-11-30" }),
      record({ id: "mid", endDate: "2026-07-15" }),
    ]);
    expect(year.records.map((r) => r.id)).toEqual(["late", "mid", "early"]);
  });

  it("수확량 합계를 낸다", () => {
    const [year] = groupByYear([
      record({ id: "a", yieldKg: 100 }),
      record({ id: "b", yieldKg: 55.5 }),
    ]);
    expect(year.totalYieldKg).toBe(155.5);
  });

  it("적어 둔 수확량이 하나도 없으면 합계가 null 이다 — 0kg 흉작과 구별해야 한다", () => {
    const [year] = groupByYear([
      record({ id: "a", yieldKg: null }),
      record({ id: "b", yieldKg: null }),
    ]);
    expect(year.totalYieldKg).toBeNull();
  });

  it("일부만 적혀 있으면 적힌 것만 더한다", () => {
    const [year] = groupByYear([
      record({ id: "a", yieldKg: 80 }),
      record({ id: "b", yieldKg: null }),
    ]);
    expect(year.totalYieldKg).toBe(80);
  });

  it("0kg 은 미기록으로 뭉개지 않는다", () => {
    const [year] = groupByYear([record({ yieldKg: 0 })]);
    expect(year.totalYieldKg).toBe(0);
  });

  it("빈 입력은 빈 배열이다", () => {
    expect(groupByYear([])).toEqual([]);
  });

  it("원본 배열을 건드리지 않는다", () => {
    const rows = [
      record({ id: "a", endDate: "2024-01-01" }),
      record({ id: "b", endDate: "2026-01-01" }),
    ];
    groupByYear(rows);
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("filterByYear", () => {
  const rows = [
    record({ id: "a", endDate: "2026-05-01" }),
    record({ id: "b", endDate: "2025-05-01" }),
  ];

  it("고른 해만 남긴다", () => {
    expect(filterByYear(rows, 2025).map((r) => r.id)).toEqual(["b"]);
  });

  it("null 이면 전부 남긴다", () => {
    expect(filterByYear(rows, null)).toHaveLength(2);
  });

  it("기록이 없는 해를 고르면 빈 배열이다", () => {
    expect(filterByYear(rows, 1999)).toEqual([]);
  });
});

describe("cultivationDays", () => {
  it("파종일부터 수확일까지 날짜 수를 센다", () => {
    expect(
      cultivationDays(
        record({ sowingDate: "2026-08-20", endDate: "2026-11-05" }),
      ),
    ).toBe(77);
  });

  it("해를 넘겨도 맞는다", () => {
    expect(
      cultivationDays(
        record({ sowingDate: "2025-10-12", endDate: "2026-06-08" }),
      ),
    ).toBe(239);
  });

  it("서머타임 전환을 걸쳐도 하루씩 어긋나지 않는다", () => {
    // 미국/유럽 서머타임 전환일을 포함하는 구간. 지역 시간대로 파싱하면 23시간
    // 짜리 하루가 생겨 반올림이 어긋난다.
    expect(
      cultivationDays(
        record({ sowingDate: "2026-03-01", endDate: "2026-04-01" }),
      ),
    ).toBe(31);
  });

  it("날짜가 망가져 있으면 0 을 준다 — 화면이 NaN 을 그리지 않게", () => {
    expect(cultivationDays(record({ sowingDate: "" }))).toBe(0);
  });
});

describe("toCultivationRecord", () => {
  function row(over: Partial<CultivationRecordRow> = {}): CultivationRecordRow {
    return {
      id: "c1",
      variant_id: 7,
      sowing_date: "2026-05-05",
      harvested_at: "2026-09-19",
      failed_at: null,
      yield_kg: null,
      plot_name_at_end: null,
      plots: { id: "p1", name: "배고프다" },
      crop_variants: { crops: { name: "고추" } },
      ...over,
    };
  }

  it("수확한 재배는 harvested_at 이 끝난 날이다", () => {
    const r = toCultivationRecord(row());
    expect(r?.endDate).toBe("2026-09-19");
    expect(r?.endKind).toBe("HARVESTED");
  });

  it("🔴 중단한 재배는 failed_at 이 끝난 날이다", () => {
    // 이 검사가 지키는 것: 밭 화면이 끝난 재배를 접기로 내리면서 마이페이지가
    // 유일한 입구가 됐다. 여기서 실패를 흘리면 중단한 재배는 아무 데서도 못
    // 들어간다(2026-09-22 실측 — 방울토마토 1건 · 일지 1줄).
    const r = toCultivationRecord(
      row({ harvested_at: null, failed_at: "2026-09-17" }),
    );
    expect(r?.endDate).toBe("2026-09-17");
    expect(r?.endKind).toBe("FAILED");
  });

  it("아직 안 끝났으면 기록이 아니다", () => {
    expect(
      toCultivationRecord(row({ harvested_at: null, failed_at: null })),
    ).toBeNull();
  });

  it("파종일을 모르면 기록이 아니다 — 재배 기간을 낼 수 없다", () => {
    expect(toCultivationRecord(row({ sowing_date: null }))).toBeNull();
  });

  it("밭 id 를 들고 온다 — 작물명 링크가 이걸 쓴다", () => {
    expect(toCultivationRecord(row())?.plotId).toBe("p1");
  });

  it("🔴 박아 둔 밭 이름이 지금 이름보다 먼저다 — 밭 이름을 고쳐도 기록은 안 바뀐다", () => {
    const r = toCultivationRecord(
      row({
        plot_name_at_end: "옛 이름",
        plots: { id: "p1", name: "새 이름" },
      }),
    );
    expect(r?.plotKo).toBe("옛 이름");
  });

  it("박아 둔 이름이 없으면 지금 이름이다 — 기르는 중이거나 옛 기록", () => {
    expect(toCultivationRecord(row())?.plotKo).toBe("배고프다");
  });

  it("🔴 수확량은 numeric 이라 문자열로 온다 — 숫자로 바꾼다", () => {
    // 문자열인 채로 두면 연도별 합계가 `"12.5" + "3"` 으로 이어 붙는다
    expect(toCultivationRecord(row({ yield_kg: "12.5" }))?.yieldKg).toBe(12.5);
  });

  it("🔴 안 적은 수확량은 0 이 아니라 null 이다", () => {
    // `Number(null)` 은 0 이다. 0kg 흉작과 미기록이 같아지면 합계가
    // `기록 없음` 대신 `0 kg` 을 말한다
    expect(toCultivationRecord(row({ yield_kg: null }))?.yieldKg).toBeNull();
    expect(toCultivationRecord(row({ yield_kg: "" }))?.yieldKg).toBeNull();
    expect(toCultivationRecord(row({ yield_kg: 0 }))?.yieldKg).toBe(0);
  });

  it("PostgREST 가 다대일을 배열로 줘도 읽는다", () => {
    // `plotSummary.ts` 가 밟은 함정이다. 중첩 select 의 추론이 갈린다
    const r = toCultivationRecord(
      row({
        plots: [{ id: "p2", name: "집앞" }],
        crop_variants: [{ crops: [{ name: "참깨" }] }],
      }),
    );
    expect(r?.plotId).toBe("p2");
    expect(r?.plotKo).toBe("집앞");
    expect(r?.cropKo).toBe("참깨");
  });

  it("이름이 비어도 화면이 빈칸을 그리지 않게 채운다", () => {
    const r = toCultivationRecord(
      row({ plots: { id: "p3", name: null }, crop_variants: null }),
    );
    expect(r?.plotKo).toBe("이름 없는 밭");
    expect(r?.cropKo).toBe("이름 없는 작물");
  });
});
