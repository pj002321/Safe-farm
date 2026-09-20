import { describe, expect, it } from "vitest";
import {
  buildTimeline,
  type TimelineCultivation,
  type TimelineEventRow,
} from "./timeline";

const CULTIVATION: TimelineCultivation = {
  id: "c1",
  cropKo: "배추",
  sowingDate: "2026-08-20",
  sowingType: "SEED",
  harvestedAt: null,
  failedAt: null,
  failureReason: null,
};

/** 날씨 칸이 전부 빈 행. 이 작업 전에 쌓인 14행과 같은 모양이다. */
const NO_WEATHER = {
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

function note(id: string, occurredOn: string): TimelineEventRow {
  return {
    id,
    kind: "NOTE",
    occurredOn,
    body: "잎에 구멍",
    stageOrder: null,
    forecastOn: null,
    workKind: null,
    taskNote: null,
    createdAt: "2026-09-19T11:41:00Z",
    adviceText: null,
    weather: NO_WEATHER,
  };
}

describe("buildTimeline", () => {
  it("파종을 재배 컬럼에서 만든다 — 이벤트 테이블에 없어도 나온다", () => {
    const entries = buildTimeline({ cultivation: CULTIVATION, events: [] });

    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("SOWN");
    expect(entries[0].titleKo).toBe("배추 씨 뿌림");
  });

  it("모종이면 문구가 다르다", () => {
    const entries = buildTimeline({
      cultivation: { ...CULTIVATION, sowingType: "SEEDLING" },
      events: [],
    });

    expect(entries[0].titleKo).toBe("배추 모종 심음");
  });

  it("최신이 먼저다", () => {
    const entries = buildTimeline({
      cultivation: CULTIVATION,
      events: [note("e1", "2026-09-01"), note("e2", "2026-09-10")],
    });

    expect(entries.map((e) => e.id)).toEqual(["e2", "e1", "c1:SOWN"]);
  });

  it("같은 날이면 그날 나중 일이 위로 온다", () => {
    const entries = buildTimeline({
      cultivation: { ...CULTIVATION, harvestedAt: "2026-10-20" },
      events: [note("e1", "2026-10-20")],
    });

    expect(entries.map((e) => e.kind)).toEqual(["HARVESTED", "NOTE", "SOWN"]);
  });

  it("같은 날 같은 종류면 id 로 갈라 순서가 고정된다", () => {
    const events = [note("b", "2026-09-01"), note("a", "2026-09-01")];
    const first = buildTimeline({ cultivation: CULTIVATION, events });
    const second = buildTimeline({
      cultivation: CULTIVATION,
      events: [...events].reverse(),
    });

    expect(first.map((e) => e.id)).toEqual(second.map((e) => e.id));
  });

  it("중단한 재배는 사유를 한글로 붙인다", () => {
    const entries = buildTimeline({
      cultivation: {
        ...CULTIVATION,
        failedAt: "2026-09-30",
        failureReason: "PEST",
      },
      events: [],
    });

    expect(entries[0].kind).toBe("FAILED");
    expect(entries[0].bodyKo).toBe("병해충");
  });

  it("예측 이벤트는 예상일을 한 줄로 적는다", () => {
    const entries = buildTimeline({
      cultivation: CULTIVATION,
      events: [
        {
          id: "f1",
          kind: "FORECAST",
          occurredOn: "2026-09-10",
          body: null,
          stageOrder: null,
          forecastOn: "2026-10-18",
          workKind: null,
          taskNote: null,
          createdAt: "2026-09-19T11:41:00Z",
          adviceText: null,
          weather: NO_WEATHER,
        },
      ],
    });

    expect(entries[0].bodyKo).toBe("2026-10-18 수확 예상");
  });

  it("파종일을 모르면 파종 줄이 없다", () => {
    const entries = buildTimeline({
      cultivation: { ...CULTIVATION, sowingDate: null },
      events: [],
    });

    expect(entries).toEqual([]);
  });
});
