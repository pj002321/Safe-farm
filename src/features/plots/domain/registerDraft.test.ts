import { describe, expect, it } from "vitest";
import {
  parseDraft,
  restoredLocation,
  toDraftValues,
  toElapsedKo,
} from "./registerDraft";

describe("toDraftValues", () => {
  it("같은 name 이 여럿이면 배열로 모은다 — 작물 체크박스가 그렇다", () => {
    const form = new FormData();
    form.append("cropIds", "5");
    form.append("cropIds", "12");
    form.append("name", "아빠 텃밭");
    expect(toDraftValues(form)).toEqual({
      cropIds: ["5", "12"],
      name: ["아빠 텃밭"],
    });
  });

  it("__step 은 담지 않는다 — 3단계로 복원하면 지도가 숨은 채 만들어진다", () => {
    const form = new FormData();
    form.append("__step", "3");
    form.append("name", "밭");
    expect(toDraftValues(form)).toEqual({ name: ["밭"] });
  });

  it("파일 값은 담지 않는다 — 글자만 저장한다", () => {
    const form = new FormData();
    form.append("photo", new File([""], "a.png"));
    form.append("name", "밭");
    expect(toDraftValues(form)).toEqual({ name: ["밭"] });
  });
});

describe("parseDraft", () => {
  it("모양이 맞으면 읽는다", () => {
    const raw = JSON.stringify({
      savedAt: "2026-09-18T10:00:00.000Z",
      values: { name: ["밭"] },
    });
    expect(parseDraft(raw)).toEqual({
      savedAt: "2026-09-18T10:00:00.000Z",
      values: { name: ["밭"] },
    });
  });

  it("깨진 JSON 은 null — 저장본이 이상해도 폼은 떠야 한다", () => {
    expect(parseDraft("{{{")).toBeNull();
    expect(parseDraft(null)).toBeNull();
  });

  it("칸이 빠진 옛 판본도 null", () => {
    // savedAt 없이 값만 저장하던 판본이 남아 있어도 죽지 않는다
    expect(parseDraft(JSON.stringify({ name: ["밭"] }))).toBeNull();
    expect(
      parseDraft(JSON.stringify({ savedAt: "2026-09-18T10:00:00.000Z" })),
    ).toBeNull();
  });
});

describe("restoredLocation", () => {
  const complete = {
    latitude: ["36.4109"],
    longitude: ["128.159"],
    addressKo: ["경북 상주시 남상주로"],
    regionCode: ["4725010300"],
    regionKo: ["경북 상주시"],
  };

  it("다섯 칸이 다 있으면 좌표를 숫자로 돌려준다", () => {
    expect(restoredLocation(complete)).toEqual({
      latitude: 36.4109,
      longitude: 128.159,
      addressKo: "경북 상주시 남상주로",
      regionCode: "4725010300",
      regionKo: "경북 상주시",
    });
  });

  it("하나라도 없으면 null — 반만 복원하면 주소와 핀이 어긋난다", () => {
    expect(restoredLocation({ ...complete, addressKo: [] })).toBeNull();
    expect(restoredLocation({ ...complete, regionKo: [""] })).toBeNull();
  });

  it("지도를 안 고르고 나간 저장본은 null", () => {
    // 그때 latitude·longitude input 은 있지만 값이 비어 있다
    expect(
      restoredLocation({ latitude: [""], longitude: [""], name: ["밭"] }),
    ).toBeNull();
  });

  it("좌표가 숫자가 아니면 null", () => {
    expect(restoredLocation({ ...complete, latitude: ["어쩌구"] })).toBeNull();
  });
});

describe("toElapsedKo", () => {
  const now = new Date("2026-09-18T12:00:00.000Z");
  const minutesAgo = (m: number) =>
    new Date(now.getTime() - m * 60_000).toISOString();

  it("분·시간·일로 접는다", () => {
    expect(toElapsedKo(minutesAgo(0), now)).toBe("방금 전");
    expect(toElapsedKo(minutesAgo(30), now)).toBe("30분 전");
    expect(toElapsedKo(minutesAgo(120), now)).toBe("2시간 전");
    expect(toElapsedKo(minutesAgo(60 * 24 * 8), now)).toBe("8일 전");
  });

  it("기기 시계가 뒤로 갔어도 '-3분 전' 을 적지 않는다", () => {
    expect(
      toElapsedKo(new Date(now.getTime() + 180_000).toISOString(), now),
    ).toBe("방금 전");
  });

  it("전부 '…전' 으로 끝난다 — 배너가 뒤에 '에' 를 붙인다", () => {
    for (const m of [0, 30, 120, 60 * 24 * 8]) {
      expect(toElapsedKo(minutesAgo(m), now)).toMatch(/전$/);
    }
  });

  it("시각이 깨졌으면 null — 배너가 그 문구를 생략한다", () => {
    expect(toElapsedKo("어쩌구", now)).toBeNull();
  });
});
