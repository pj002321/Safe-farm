import { describe, expect, it } from "vitest";
import { toCsv } from "@/shared/utils/csv";
import { DIARY_CSV_HEADERS, diaryCsvFileName, diaryCsvRows } from "./diaryCsv";
import type { EntryWeather, TimelineEntry } from "./timeline";

const NO_WEATHER: EntryWeather = {
  skyKo: null,
  tempMaxC: null,
  tempMinC: null,
  rainfallMm: null,
  humidityPct: null,
  windMs: null,
  windDirDeg: null,
  sunriseAt: null,
  sunsetAt: null,
};

const CTX = { cropKo: "양파", stageNames: { 5: "줄기비대기" } };

function note(occurredOn: string, over: Partial<TimelineEntry> = {}) {
  return {
    id: occurredOn,
    kind: "NOTE",
    occurredOn,
    titleKo: "관찰 기록",
    bodyKo: "잎에 구멍",
    stageOrder: 5,
    workKindKo: "방제",
    createdAtIso: "2026-09-19T11:41:00Z",
    adviceTextKo: null,
    weather: NO_WEATHER,
    ...over,
  } as TimelineEntry;
}

describe("diaryCsvRows", () => {
  it("오름차순으로 세운다 — 화면(최신순)과 반대다", () => {
    const rows = diaryCsvRows([note("2026-09-19"), note("2026-06-02")], CTX);

    expect(rows[0]?.[0]).toBe("2026-06-02");
    expect(rows[1]?.[0]).toBe("2026-09-19");
  });

  it("같은 날 안의 차례까지 뒤집는다 — 날짜만 다시 정렬하면 그날만 거꾸로 선다", () => {
    // buildTimeline 이 준 순서: 그날 나중 일이 위(최신순)
    const rows = diaryCsvRows(
      [
        note("2026-09-19", { id: "b", bodyKo: "나중" }),
        note("2026-09-19", { id: "a", bodyKo: "먼저" }),
      ],
      CTX,
    );

    expect(rows[0]?.[5]).toBe("먼저");
    expect(rows[1]?.[5]).toBe("나중");
  });

  it("단계 번호를 이름으로 바꾼다", () => {
    expect(diaryCsvRows([note("2026-09-19")], CTX)[0]?.[2]).toBe("줄기비대기");
  });

  it("빈 날씨를 0 으로 채우지 않는다 — 안 온 날과 못 찾은 날이 같아진다", () => {
    const row = diaryCsvRows([note("2026-09-19")], CTX)[0];
    // 최고·최저·강수 세 칸
    expect([row?.[6], row?.[7], row?.[8]]).toEqual([null, null, null]);
  });

  it("본문이 없으면 제목을 싣는다 — 파종·수확 줄이 그렇다", () => {
    const row = diaryCsvRows(
      [
        note("2026-08-15", {
          kind: "SOWN",
          titleKo: "양파 씨 뿌림",
          bodyKo: null,
          stageOrder: null,
          workKindKo: null,
          weather: null,
        }),
      ],
      CTX,
    )[0];

    expect(row?.[5]).toBe("양파 씨 뿌림");
  });

  it("칸 수가 머리글과 맞는다", () => {
    const row = diaryCsvRows([note("2026-09-19")], CTX)[0];
    expect(row?.length).toBe(DIARY_CSV_HEADERS.length);
  });
});

describe("toCsv 와 함께 쓸 때", () => {
  it("수식으로 시작하는 메모는 toCsv 가 막는다 — 여기서 또 막지 않는다", () => {
    const csv = toCsv(
      DIARY_CSV_HEADERS,
      diaryCsvRows([note("2026-09-19", { bodyKo: "=1+1" })], CTX),
    );
    expect(csv).toContain("'=1+1");
  });

  it("음수 기온은 그대로 나간다 — 직접 막았으면 글자로 망가진다", () => {
    const csv = toCsv(
      DIARY_CSV_HEADERS,
      diaryCsvRows(
        [
          note("2026-01-10", {
            weather: { ...NO_WEATHER, tempMinC: -3.5 },
          }),
        ],
        CTX,
      ),
    );
    expect(csv).toContain(",-3.5,");
    expect(csv).not.toContain("'-3.5");
  });
});

describe("diaryCsvFileName", () => {
  it("공백과 구분자를 밑줄로 바꾼다", () => {
    expect(diaryCsvFileName("방울 토마토", "목포 앞밭")).toBe(
      "영농일지_방울_토마토_목포_앞밭.csv",
    );
  });
});
