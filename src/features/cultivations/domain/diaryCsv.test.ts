import { describe, expect, it } from "vitest";
import { type CsvValue, toCsv } from "@/shared/utils/csv";
import {
  DIARY_CSV_HEADERS,
  type DiaryCsvContext,
  diaryCsvFileName,
  diaryCsvRows,
} from "./diaryCsv";
import type {
  EntryWeather,
  TimelineCultivation,
  TimelineEntry,
} from "./timeline";

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

/** 끝난 재배. `buildTimeline()` 에 넘기는 것과 같은 객체다. */
const 끝난재배: TimelineCultivation = {
  id: "c1",
  cropKo: "양파",
  sowingDate: "2026-09-04",
  sowingType: "SEED",
  harvestedAt: "2027-06-15",
  failedAt: null,
  failureReason: null,
};

const CTX: DiaryCsvContext = {
  cultivation: 끝난재배,
  stageNames: { 5: "줄기비대기" },
  plotKo: "배고프다",
  yieldKg: 38,
};

/**
 * 칸 **이름으로** 값을 꺼낸다.
 *
 * ⚠️ 번호로 짚으면 칸이 하나 늘 때마다 검사가 통째로 깨진다 — 2026-09-22 에
 *    `종류`·`할 일 카드` 를 앞쪽에 끼우면서 실제로 다섯이 깨졌다. 이름으로 짚으면
 *    차례가 바뀌어도 살아남고, 무엇을 보는 검사인지도 읽힌다.
 */
function 칸(row: readonly CsvValue[] | undefined, labelKo: string): CsvValue {
  const at = (DIARY_CSV_HEADERS as readonly string[]).indexOf(labelKo);
  if (at < 0) throw new Error(`머리글에 '${labelKo}' 칸이 없다`);
  return row?.[at] ?? null;
}

function note(occurredOn: string, over: Partial<TimelineEntry> = {}) {
  return {
    id: occurredOn,
    kind: "NOTE",
    occurredOn,
    titleKo: "관찰 기록",
    bodyKo: "잎에 구멍",
    stageOrder: 5,
    workKindKo: "방제",
    taskNoteKo: null,
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

    expect(칸(rows[0], "메모")).toBe("먼저");
    expect(칸(rows[1], "메모")).toBe("나중");
  });

  it("단계 번호를 이름으로 바꾼다", () => {
    expect(칸(diaryCsvRows([note("2026-09-19")], CTX)[0], "단계")).toBe(
      "줄기비대기",
    );
  });

  it("빈 날씨를 0 으로 채우지 않는다 — 안 온 날과 못 찾은 날이 같아진다", () => {
    const row = diaryCsvRows([note("2026-09-19")], CTX)[0];
    // 저장하는 아홉 칸이 전부 빈 채로 나가야 한다
    expect(
      [
        "날씨",
        "최고",
        "최저",
        "강수",
        "습도",
        "바람",
        "풍향",
        "일출",
        "일몰",
      ].map((name) => 칸(row, name)),
    ).toEqual([null, null, null, null, null, null, null, null, null]);
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

    expect(칸(row, "메모")).toBe("양파 씨 뿌림");
  });

  it("카드 메모는 메모와 다른 칸에 싣는다 — 합치면 카드 제목이 흐려진다", () => {
    const row = diaryCsvRows(
      [
        note("2026-09-19", {
          kind: "TASK_DONE",
          titleKo: "작업 완료",
          bodyKo: "물주기",
          taskNoteKo: "호스로 20분",
        }),
      ],
      CTX,
    )[0];

    // 카드 제목은 제 칸으로 가고 `메모` 는 빈다 — 둘이 섞이면 읽는 사람이
    // 내가 쓴 메모인지 카드 이름인지 알 수 없다
    expect(칸(row, "할 일 카드")).toBe("물주기");
    expect(칸(row, "카드 메모")).toBe("호스로 20분");
    expect(칸(row, "메모")).toBeNull();
  });

  it("칸 수가 머리글과 맞는다", () => {
    const row = diaryCsvRows([note("2026-09-19")], CTX)[0];
    expect(row?.length).toBe(DIARY_CSV_HEADERS.length);
  });

  it("종류 칸이 줄이 무엇인지 말한다", () => {
    // 이 칸이 없으면 엑셀에서 "한 일만 추려 보기" 가 안 된다
    const 종류 = (over: Partial<TimelineEntry>) =>
      칸(diaryCsvRows([note("2026-09-19", over)], CTX)[0], "종류");

    expect(종류({})).toBe("메모");
    expect(종류({ kind: "TASK_DONE" })).toBe("할 일 카드");
    expect(종류({ kind: "STAGE_SET" })).toBe("단계 보정");
    expect(종류({ kind: "HARVESTED" })).toBe("수확");
    expect(종류({ kind: "FAILED" })).toBe("중단");
  });

  it("파종 줄은 씨와 모종을 갈라 적는다 — `timeline.ts` 와 같은 말로", () => {
    const 심음 = (sowingType: TimelineCultivation["sowingType"]) =>
      칸(
        diaryCsvRows([note("2026-09-04", { kind: "SOWN" })], {
          ...CTX,
          cultivation: { ...끝난재배, sowingType },
        })[0],
        "종류",
      );

    // ⚠ 같은 줄의 `메모` 칸에는 `${작물} 씨 뿌림` 이 들어간다. 두 곳이 갈리면
    //   한 줄 안에서 `종류=씨 뿌림` 인데 `메모=양파 모종 심음` 이 된다
    expect(심음("SEED")).toBe("씨 뿌림");
    expect(심음("SEEDLING")).toBe("모종 심음");
  });

  it("🔴 저장한 날씨 아홉을 다 내보낸다 — 다섯이 빠져 있었다", () => {
    // 습도·바람·풍향·일출·일몰은 저장도 화면도 하는데 CSV 에만 없었다.
    // 머리글이 세 칸짜리 계획에서 안 따라온 것이다(2026-09-22 발견).
    const row = diaryCsvRows(
      [
        note("2026-09-20", {
          weather: {
            skyKo: "맑음",
            tempMaxC: 26.4,
            tempMinC: 20.3,
            rainfallMm: 0.1,
            humidityPct: 78,
            windMs: 6.63,
            windDirDeg: 3,
            sunriseAt: "06:20",
            sunsetAt: "18:34",
          },
        }),
      ],
      CTX,
    )[0];

    // ⚠ 값이 다른 세 칸을 짚는다. 전부 null 로만 검사하면 `최고`↔`최저` 를
    //   바꿔 놔도 통과한다
    expect(칸(row, "최고")).toBe(26.4);
    expect(칸(row, "최저")).toBe(20.3);
    expect(칸(row, "강수")).toBe(0.1);
    expect(칸(row, "습도")).toBe(78);
    expect(칸(row, "바람")).toBe(6.63);
    // 도(度)가 아니라 화면과 같은 글자다. 3° 는 북
    expect(칸(row, "풍향")).toBe("북");
    // ⚠ 이미 시각만 저장돼 있다. 자르는 코드를 새로 두면 두 벌이 된다
    expect(칸(row, "일출")).toBe("06:20");
    expect(칸(row, "일몰")).toBe("18:34");
  });

  it("재배 단위 칸은 줄마다 같은 값이다", () => {
    // 농사로 폼의 `시작일·종료일·필지` 도 원래 그렇게 반복되는 칸이다
    const rows = diaryCsvRows([note("2026-09-19"), note("2026-06-02")], CTX);

    for (const row of rows) {
      expect(칸(row, "텃밭")).toBe("배고프다");
      expect(칸(row, "파종일")).toBe("2026-09-04");
      expect(칸(row, "종료일")).toBe("2027-06-15");
      expect(칸(row, "재배일수")).toBe(284);
      expect(칸(row, "수확량(kg)")).toBe(38);
    }
  });

  it("🔴 기르는 중이면 뒤 셋이 빈다 — 0 으로 채우지 않는다", () => {
    // `재배일수 0` 은 "같은 날 심고 거뒀다", `수확량 0` 은 흉작이다.
    // 모르는 것과 같아지면 안 된다(상세에서 내보낼 때가 이 경우다).
    const row = diaryCsvRows([note("2026-09-19")], {
      ...CTX,
      cultivation: { ...끝난재배, harvestedAt: null },
      yieldKg: null,
    })[0];

    expect(칸(row, "텃밭")).toBe("배고프다");
    expect(칸(row, "파종일")).toBe("2026-09-04");
    expect(칸(row, "종료일")).toBeNull();
    expect(칸(row, "재배일수")).toBeNull();
    expect(칸(row, "수확량(kg)")).toBeNull();
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
