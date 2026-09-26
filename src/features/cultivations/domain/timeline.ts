import { failureReasonKo } from "./failureReason";

/**
 * ---------------------------------------------
 * [Feature]: 기록 타임라인 — 재배 한 건의 시간순 (순수)
 *
 * [Description]
 * - 파종·단계 전환·완료 작업·메모를 한 줄로 합쳐 시간순으로 세운다. 화면에는
 *   출처가 안 보이지만 값은 **두 곳에서** 온다:
 *     · `cultivations` 의 날짜 컬럼 — 파종·수확·실패
 *     · `cultivation_events` 의 행 — 메모·완료 작업·단계 보정·예측
 * - 파종·수확을 이벤트 테이블에 또 넣지 않는 이유는 마이그레이션 머리말에 적었다.
 *   같은 사실이 두 곳에 있으면 한쪽만 고쳐졌을 때 어느 쪽이 맞는지 알 수 없다.
 * - 같은 날 여러 건이면 **정해진 순서**로 세운다. 배열 순서에 맡기면 새로고침
 *   할 때마다 줄이 바뀌어 사용자가 화면을 못 믿는다.
 * - 생육단계 전환은 여기서 만들지 않는다. 그건 `stageTimeline.ts` 가 관측에서
 *   계산하는 값이고, 이 목록에는 **사람이 남긴 것**만 온다.
 *
 * [Usage]
 * ```ts
 * const entries = buildTimeline({ cultivation, events });
 * entries[0].occurredOn;  // 최신이 먼저
 * ```
 * ---------------------------------------------
 */

export type TimelineKind =
  | "SOWN"
  | "NOTE"
  | "TASK_DONE"
  | "STAGE_SET"
  | "STAGE_ADD"
  | "FORECAST"
  | "HARVESTED"
  | "FAILED";

/**
 * 저장할 때 행에 박아 둔 그날 날씨. **칸마다 비어 있을 수 있고 그게 정상이다.**
 *
 * ⚠️ 빈 칸을 0 으로 바꾸지 말 것. `rainfallMm = 0` 은 "비가 안 왔다" 는 뜻이라,
 *    못 찾은 날과 안 온 날이 화면에서 같아진다.
 */
export interface EntryWeather {
  skyKo: string | null;
  tempMaxC: number | null;
  tempMinC: number | null;
  rainfallMm: number | null;
  humidityPct: number | null;
  windMs: number | null;
  /** 그날 대표 풍향(도). **불어오는 쪽**이다. */
  windDirDeg: number | null;
  /**
   * `"06:06"` 꼴. **시각만 담는다** — 저장할 때 이미 잘라서 넣는다.
   *
   * ⚠️ 주석이 `"2026-09-19T06:19"` 라고 돼 있었는데 실측(2026-09-22)은 `06:06`
   *    이다. 화면도 CSV 도 그대로 쓰면 되고, 자르는 코드를 새로 두지 말 것.
   */
  sunriseAt: string | null;
  sunsetAt: string | null;
}

/** `cultivation_events` 한 행을 화면이 쓰는 이름으로 좁힌 것. */
export interface TimelineEventRow {
  id: string;
  kind: "NOTE" | "TASK_DONE" | "STAGE_SET" | "STAGE_ADD" | "FORECAST";
  occurredOn: string;
  body: string | null;
  stageOrder: number | null;
  forecastOn: string | null;
  /** 행이 만들어진 시각(ISO). 어제 일을 오늘 적으면 occurredOn 과 갈린다. */
  createdAt: string;
  /** 농사로의 "활동유형". 고르지 않았으면 null. */
  workKind: string | null;
  /** `TASK_DONE` 카드에 적은 한 줄. 안 적었으면 null. */
  taskNote: string | null;
  /** 그날 AI 리포트 글. 그날 첫 `TASK_DONE` 에만 있다. */
  adviceText: string | null;
  weather: EntryWeather;
}

/** `cultivations` 에서 날짜만 뽑은 것. */
export interface TimelineCultivation {
  id: string;
  cropKo: string;
  sowingDate: string | null;
  sowingType: "SEED" | "SEEDLING";
  harvestedAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
}

export interface TimelineEntry {
  /** 화면 key. 이벤트는 행 id, 재배에서 온 줄은 `{재배id}:{종류}`. */
  id: string;
  kind: TimelineKind;
  occurredOn: string;
  titleKo: string;
  /** 한 줄 덧붙임. 없으면 null. */
  bodyKo: string | null;
  /** `STAGE_SET` 이 가리키는 단계. 화면이 이름을 붙인다. */
  stageOrder: number | null;
  /**
   * 농사로의 "활동유형". 안 골랐거나 재배 컬럼에서 온 줄이면 null.
   *
   * `titleKo` 를 덮지 않고 따로 둔다 — 제목은 kind 가 정하는 말이고 이건 그날
   * 무엇을 했나다. 둘을 합치면 `EVENT_TITLE` 을 보는 §6-다 쪽과 엉킨다.
   */
  workKindKo: string | null;
  /**
   * 담은 카드에 적은 한 줄. `TASK_DONE` 말고는 전부 null 이다.
   *
   * `bodyKo`(= 카드 제목)와 따로 둔다. 한 칸에 몰아넣으면 `hideDoneToday` 가
   * 제목으로 거르지 못해 눌러 둔 카드가 다시 뜬다.
   */
  taskNoteKo: string | null;
  /**
   * **적은 시각**(ISO). 재배 컬럼에서 온 줄(파종·수확·중단)은 null 이다 — 그 셋은
   * 행이 아니라 상태라 "언제 적었나" 가 없다.
   *
   * `occurredOn`(있었던 날)과 다르다. 사나흘 빠뜨린 것을 하루에 몰아 적으면 이
   * 값이 전부 같은 날이 된다.
   */
  createdAtIso: string | null;
  /**
   * `했음` 을 누른 그 시점의 AI 리포트 글. 그날 첫 줄에만 있고 나머지는 null.
   *
   * 길어서 화면은 접어 둔다. 여기 있는 것은 **그때 박아 둔 글**이라, `advices`
   * 표가 지워져도 남는다.
   */
  adviceTextKo: string | null;
  /**
   * 저장할 때 박은 그날 날씨. 재배 컬럼에서 온 줄(파종·수확·중단)은 null 이다 —
   * 그 셋은 `cultivation_events` 행이 아니라 날씨를 박을 자리가 없다.
   */
  weather: EntryWeather | null;
}

/**
 * 같은 날 안에서의 순서.
 *
 * 작은 값이 아래(먼저 있었던 일)로 간다. 파종은 그날의 시작이고 수확·실패는
 * 그날의 끝이다. 그 사이에 사람이 남긴 것들이 온다.
 */
const SAME_DAY_ORDER: Record<TimelineKind, number> = {
  SOWN: 0,
  STAGE_SET: 1,
  STAGE_ADD: 1,
  TASK_DONE: 2,
  NOTE: 3,
  FORECAST: 4,
  HARVESTED: 5,
  FAILED: 5,
};

const EVENT_TITLE: Record<TimelineEventRow["kind"], string> = {
  NOTE: "관찰 기록",
  TASK_DONE: "작업 완료",
  STAGE_SET: "생육단계 직접 지정",
  STAGE_ADD: "단계 추가",
  FORECAST: "수확 예측",
};

/**
 * 시작을 뭐라고 부르나. **씨를 뿌렸나 모종을 심었나.**
 *
 * ⚠️ 여기 한 곳에서만 정한다. 타임라인 제목(`${작물} 씨 뿌림`)과 일지 CSV 의
 *    `종류` 칸이 같이 부른다 — 두 벌로 적으면 한 줄 안에서 `종류=씨 뿌림` 인데
 *    `메모=양파 모종 심음` 인 일이 생긴다. 서류로 옮겨 적는 파일에서 제일 나쁜
 *    종류의 어긋남이다(2026-09-22).
 */
export function sowingLabelKo(
  sowingType: TimelineCultivation["sowingType"],
): string {
  return sowingType === "SEEDLING" ? "모종 심음" : "씨 뿌림";
}

/** 재배 컬럼에서 나오는 줄. 날짜가 없으면 그 줄은 없다. */
function fromCultivation(
  cultivation: TimelineCultivation,
): readonly TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  if (cultivation.sowingDate !== null) {
    entries.push({
      id: `${cultivation.id}:SOWN`,
      kind: "SOWN",
      occurredOn: cultivation.sowingDate,
      titleKo: `${cultivation.cropKo} ${sowingLabelKo(cultivation.sowingType)}`,
      bodyKo: null,
      stageOrder: null,
      workKindKo: null,
      taskNoteKo: null,
      createdAtIso: null,
      adviceTextKo: null,
      weather: null,
    });
  }

  if (cultivation.harvestedAt !== null) {
    entries.push({
      id: `${cultivation.id}:HARVESTED`,
      kind: "HARVESTED",
      occurredOn: cultivation.harvestedAt,
      titleKo: `${cultivation.cropKo} 수확`,
      bodyKo: null,
      stageOrder: null,
      workKindKo: null,
      taskNoteKo: null,
      createdAtIso: null,
      adviceTextKo: null,
      weather: null,
    });
  }

  if (cultivation.failedAt !== null) {
    entries.push({
      id: `${cultivation.id}:FAILED`,
      kind: "FAILED",
      occurredOn: cultivation.failedAt,
      titleKo: `${cultivation.cropKo} 재배 중단`,
      bodyKo: failureReasonKo(cultivation.failureReason),
      stageOrder: null,
      workKindKo: null,
      taskNoteKo: null,
      createdAtIso: null,
      adviceTextKo: null,
      weather: null,
    });
  }

  return entries;
}

/** 이벤트 행에서 나오는 줄. */
function fromEvent(event: TimelineEventRow): TimelineEntry {
  return {
    id: event.id,
    kind: event.kind,
    occurredOn: event.occurredOn,
    titleKo: EVENT_TITLE[event.kind],
    bodyKo:
      event.kind === "FORECAST"
        ? event.forecastOn === null
          ? null
          : `${event.forecastOn} 수확 예상`
        : event.body,
    stageOrder: event.stageOrder,
    workKindKo: event.workKind,
    taskNoteKo: event.taskNote,
    createdAtIso: event.createdAt,
    adviceTextKo: event.adviceText,
    weather: event.weather,
  };
}

/**
 * 두 출처를 합쳐 최신순으로 세운다.
 *
 * 같은 날이면 `SAME_DAY_ORDER` 의 큰 값이 위로 온다 — 최신순이므로 그날 나중에
 * 있었던 일이 먼저 읽힌다. 그것까지 같으면 id 로 가른다. 정렬이 입력 순서에
 * 기대지 않아야 새로고침마다 줄이 바뀌지 않는다.
 */
export function buildTimeline(input: {
  cultivation: TimelineCultivation;
  events: readonly TimelineEventRow[];
}): readonly TimelineEntry[] {
  const entries = [
    ...fromCultivation(input.cultivation),
    ...input.events.map(fromEvent),
  ];

  return entries.toSorted((a, b) => {
    if (a.occurredOn !== b.occurredOn) {
      return b.occurredOn.localeCompare(a.occurredOn);
    }
    const order = SAME_DAY_ORDER[b.kind] - SAME_DAY_ORDER[a.kind];
    if (order !== 0) return order;
    return a.id.localeCompare(b.id);
  });
}
