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

/** `cultivation_events` 한 행을 화면이 쓰는 이름으로 좁힌 것. */
export interface TimelineEventRow {
  id: string;
  kind: "NOTE" | "TASK_DONE" | "STAGE_SET" | "STAGE_ADD" | "FORECAST";
  occurredOn: string;
  body: string | null;
  stageOrder: number | null;
  forecastOn: string | null;
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
      titleKo:
        cultivation.sowingType === "SEEDLING"
          ? `${cultivation.cropKo} 모종 심음`
          : `${cultivation.cropKo} 씨 뿌림`,
      bodyKo: null,
      stageOrder: null,
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
