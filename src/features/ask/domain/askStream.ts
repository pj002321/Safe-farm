/**
 * ---------------------------------------------
 * [Feature]: 답변 스트림(SSE) 읽기 (순수 함수)
 *
 * [Description]
 * - ai-service 는 답변을 토큰 단위로 흘려보낸다. 브라우저의 `EventSource` 를 쓰지
 *   못하는데, 그건 GET 만 되고 질문은 POST 이기 때문이다. 그래서 `fetch` 의 본문을
 *   직접 읽고 여기서 자른다.
 * - **네트워크는 덩어리를 마음대로 쪼갠다.** 한 이벤트가 두 덩어리에 걸쳐 오는 일이
 *   흔하므로, 읽은 만큼 이어 붙이고 완결된 것만 떼어 낸다. 남은 조각은 `rest` 로
 *   돌려주고 다음 덩어리 앞에 붙인다.
 * - 순수 함수만 둔다. 스트림을 쥐는 일은 화면이 하고 이 파일은 문자열만 다룬다 —
 *   그래야 Vitest 로 검증된다.
 *
 * [Usage]
 * ```ts
 * const { events, rest } = splitSseEvents(buffer + chunk);
 * buffer = rest;
 * for (const event of events) apply(parseAskEvent(event));
 * ```
 * ---------------------------------------------
 */

/** ai-service 가 보내는 근거 조각. 필드 이름은 파이썬 쪽 모양 그대로다. */
export interface AskMatchWire {
  body: string;
  distance: number;
  source_title: string | null;
}

export interface AskMatch {
  body: string;
  distance: number;
  sourceTitleKo: string | null;
}

export interface AskQuotaWire {
  limit: number;
  used: number;
  remaining: number;
}

/** 화면이 실제로 다루는 사건. 알 수 없는 이벤트는 여기 오기 전에 걸러진다. */
export type AskEvent =
  | { kind: "meta"; historyId: string; quota: AskQuotaWire | null }
  | { kind: "matches"; matches: AskMatch[] }
  | { kind: "token"; text: string }
  | { kind: "error"; messageKo: string }
  | { kind: "done" };

export interface SseFrame {
  name: string;
  data: string;
}

/** SSE 는 빈 줄 하나로 이벤트를 끊는다. `\r\n` 으로 오는 서버도 있어 함께 본다. */
const FRAME_BOUNDARY = /\r?\n\r?\n/;

/**
 * 버퍼에서 완결된 이벤트만 떼어 낸다.
 *
 * 마지막 조각은 아직 끝나지 않았을 수 있으므로 항상 `rest` 로 남긴다 — 끝난
 * 조각인지 아닌지를 여기서 판단하려 들면 경계에서 한 이벤트가 통째로 사라진다.
 */
export function splitSseEvents(buffer: string): {
  events: SseFrame[];
  rest: string;
} {
  const parts = buffer.split(FRAME_BOUNDARY);
  const rest = parts.pop() ?? "";

  const events: SseFrame[] = [];
  for (const part of parts) {
    const frame = parseFrame(part);
    if (frame) events.push(frame);
  }
  return { events, rest };
}

/** `event:`·`data:` 줄을 읽는다. data 가 여러 줄이면 줄바꿈으로 잇는다(SSE 규격). */
function parseFrame(raw: string): SseFrame | null {
  let name = "message";
  const data: string[] = [];

  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("event:")) name = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }

  if (data.length === 0) return null;
  return { name, data: data.join("\n") };
}

/**
 * 한 이벤트를 화면이 쓰는 모양으로 옮긴다. 모르는 이벤트나 깨진 JSON 은 null 이다
 * — 답변 한가운데서 예외를 던지면 이미 받은 문장까지 날아간다.
 */
export function parseAskEvent(frame: SseFrame): AskEvent | null {
  let payload: unknown;
  try {
    payload = JSON.parse(frame.data);
  } catch {
    return null;
  }

  switch (frame.name) {
    case "meta": {
      const value = payload as { historyId?: unknown; quota?: unknown };
      if (typeof value.historyId !== "string") return null;
      return {
        kind: "meta",
        historyId: value.historyId,
        quota: isQuota(value.quota) ? value.quota : null,
      };
    }
    case "matches":
      return {
        kind: "matches",
        matches: Array.isArray(payload) ? payload.map(toMatch) : [],
      };
    case "token":
      return typeof payload === "string"
        ? { kind: "token", text: payload }
        : null;
    case "error":
      return {
        kind: "error",
        messageKo:
          typeof payload === "string"
            ? payload
            : "답변을 받지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
      };
    case "done":
      return { kind: "done" };
    default:
      return null;
  }
}

function isQuota(value: unknown): value is AskQuotaWire {
  if (typeof value !== "object" || value === null) return false;
  const quota = value as Record<string, unknown>;
  return (
    typeof quota.limit === "number" &&
    typeof quota.used === "number" &&
    typeof quota.remaining === "number"
  );
}

function toMatch(raw: unknown): AskMatch {
  const wire = (raw ?? {}) as Partial<AskMatchWire>;
  return {
    body: typeof wire.body === "string" ? wire.body : "",
    distance: typeof wire.distance === "number" ? wire.distance : 1,
    sourceTitleKo:
      typeof wire.source_title === "string" ? wire.source_title : null,
  };
}
