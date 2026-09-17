import { describe, expect, it } from "vitest";
import { parseAskEvent, splitSseEvents } from "./askStream";

describe("splitSseEvents", () => {
  it("완결된 이벤트만 떼고 나머지는 rest 로 남긴다", () => {
    const { events, rest } = splitSseEvents(
      'event: token\ndata: "안"\n\nevent: token\ndata: "녕',
    );
    expect(events).toHaveLength(1);
    expect(rest).toBe('event: token\ndata: "녕');
  });

  it("경계에 걸친 이벤트가 사라지지 않는다", () => {
    // 네트워크가 이벤트 한가운데를 잘라도 다음 덩어리에 이어 붙이면 복구된다.
    const first = splitSseEvents('event: token\ndata: "안');
    expect(first.events).toHaveLength(0);

    const second = splitSseEvents(`${first.rest}녕"\n\n`);
    expect(second.events).toEqual([{ name: "token", data: '"안녕"' }]);
  });

  it("CRLF 로 오는 서버도 같이 자른다", () => {
    const { events } = splitSseEvents("event: done\r\ndata: true\r\n\r\n");
    expect(events).toEqual([{ name: "done", data: "true" }]);
  });

  it("data 가 없는 덩어리는 버린다 — 주석·하트비트", () => {
    const { events } = splitSseEvents(": keep-alive\n\n");
    expect(events).toHaveLength(0);
  });
});

describe("parseAskEvent", () => {
  it("meta 에서 historyId 와 잔여 횟수를 읽는다", () => {
    const event = parseAskEvent({
      name: "meta",
      data: '{"historyId":"abc","quota":{"limit":10,"used":3,"remaining":7}}',
    });
    expect(event).toEqual({
      kind: "meta",
      historyId: "abc",
      quota: { limit: 10, used: 3, remaining: 7 },
    });
  });

  it("quota 가 빠져도 historyId 만으로 성립한다", () => {
    // 피드백을 보낼 대상을 아는 것이 우선이다. 잔여 횟수는 없어도 화면이 선다.
    const event = parseAskEvent({ name: "meta", data: '{"historyId":"abc"}' });
    expect(event).toEqual({ kind: "meta", historyId: "abc", quota: null });
  });

  it("matches 의 source_title 을 화면 이름으로 옮긴다", () => {
    const event = parseAskEvent({
      name: "matches",
      data: '[{"body":"본문","distance":0.2,"source_title":"재배매뉴얼"}]',
    });
    expect(event).toEqual({
      kind: "matches",
      matches: [{ body: "본문", distance: 0.2, sourceTitleKo: "재배매뉴얼" }],
    });
  });

  it("깨진 JSON 은 null — 답변 도중 예외로 끊지 않는다", () => {
    expect(parseAskEvent({ name: "token", data: '"안' })).toBeNull();
  });

  it("모르는 이벤트는 null", () => {
    expect(parseAskEvent({ name: "heartbeat", data: "1" })).toBeNull();
  });

  it("token 이 문자열이 아니면 무시한다", () => {
    expect(parseAskEvent({ name: "token", data: "123" })).toBeNull();
  });
});
