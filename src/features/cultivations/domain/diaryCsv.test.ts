import { describe, expect, it } from "vitest";
import { buildDiaryCsv, diaryCsvFileName } from "./diaryCsv";
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
    adviceTextKo: null,
    weather: NO_WEATHER,
    ...over,
  } as TimelineEntry;
}

/** BOM 을 뗀 줄 배열. 첫 줄은 머리글이다. */
function lines(csv: string): string[] {
  return csv.slice(1).split("\r\n");
}

describe("buildDiaryCsv", () => {
  it("맨 앞에 BOM 을 붙인다 — 없으면 엑셀에서 한글이 깨진다", () => {
    expect(buildDiaryCsv([], CTX).charCodeAt(0)).toBe(0xfeff);
  });

  it("오름차순으로 세운다 — 화면(최신순)과 반대다", () => {
    const csv = buildDiaryCsv([note("2026-09-19"), note("2026-06-02")], CTX);
    const [, first, second] = lines(csv);

    expect(first.startsWith("2026-06-02")).toBe(true);
    expect(second.startsWith("2026-09-19")).toBe(true);
  });

  it("같은 날 안의 차례까지 뒤집는다 — 날짜만 다시 정렬하면 그날만 거꾸로 선다", () => {
    // buildTimeline 이 준 순서: 그날 나중 일이 위(최신순)
    const csv = buildDiaryCsv(
      [
        note("2026-09-19", { id: "b", bodyKo: "나중" }),
        note("2026-09-19", { id: "a", bodyKo: "먼저" }),
      ],
      CTX,
    );
    const [, first, second] = lines(csv);

    expect(first).toContain("먼저");
    expect(second).toContain("나중");
  });

  it("단계 번호를 이름으로 바꾼다", () => {
    expect(lines(buildDiaryCsv([note("2026-09-19")], CTX))[1]).toContain(
      "줄기비대기",
    );
  });

  it("빈 날씨를 0 으로 채우지 않는다 — 안 온 날과 못 찾은 날이 같아진다", () => {
    const row = lines(buildDiaryCsv([note("2026-09-19")], CTX))[1];
    expect(row).toBe("2026-09-19,양파,줄기비대기,방제,,잎에 구멍,,,,");
  });

  it("수식으로 시작하는 메모는 글자로 묶는다", () => {
    for (const bodyKo of ["=1+1", "+1", "-1", "@SUM(A1)", "	=1+1"]) {
      const row = lines(
        buildDiaryCsv([note("2026-09-19", { bodyKo })], CTX),
      )[1];
      expect(row).toContain("'");
    }
  });

  it("쉼표·큰따옴표가 든 메모를 감싼다", () => {
    const row = lines(
      buildDiaryCsv([note("2026-09-19", { bodyKo: '가, 나 "다"' })], CTX),
    )[1];
    expect(row).toContain('"가, 나 ""다"""');
  });

  it("본문이 없으면 제목을 싣는다 — 파종·수확 줄이 그렇다", () => {
    const row = lines(
      buildDiaryCsv(
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
      ),
    )[1];
    expect(row).toContain("양파 씨 뿌림");
  });
});

describe("diaryCsvFileName", () => {
  it("공백과 구분자를 밑줄로 바꾼다", () => {
    expect(diaryCsvFileName("방울 토마토", "목포 앞밭")).toBe(
      "영농일지_방울_토마토_목포_앞밭.csv",
    );
  });
});
