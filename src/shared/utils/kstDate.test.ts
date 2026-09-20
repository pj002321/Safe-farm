import { describe, expect, it } from "vitest";
import { kstDateString, kstStampString } from "./kstDate";

describe("kstDateString", () => {
  it("UTC 자정 직후에도 한국 날짜를 낸다", () => {
    // UTC 로 도는 서버에서 `toISOString()` 을 쓰면 여기서 09-16 이 나와
    // 누적 GDD 에서 하루가 빠진다.
    expect(kstDateString(new Date("2026-09-16T15:30:00Z"))).toBe("2026-09-17");
  });

  it("한국 시간 자정 직전은 아직 전날", () => {
    expect(kstDateString(new Date("2026-09-16T14:59:00Z"))).toBe("2026-09-16");
  });

  it("두 자리로 채운다", () => {
    expect(kstDateString(new Date("2026-01-05T03:00:00Z"))).toBe("2026-01-05");
  });
});

describe("kstStampString", () => {
  it("UTC 로 온 값을 한국 날짜·시각으로 바꾼다", () => {
    expect(kstStampString("2026-09-19T11:41:00Z")).toBe("2026-09-19 20:41");
  });

  it("한국 시간 자정 직후면 날짜가 하루 넘어간다", () => {
    // UTC 그대로 잘라 쓰면 09-19 로 남아 "언제 적었나" 가 하루 어긋난다.
    expect(kstStampString("2026-09-19T15:10:00Z")).toBe("2026-09-20 00:10");
  });

  it("24시간 꼴로 적는다 — 오후가 13시 이상으로 나온다", () => {
    expect(kstStampString("2026-09-19T04:00:00Z")).toBe("2026-09-19 13:00");
  });

  it("값이 없거나 읽을 수 없으면 null", () => {
    expect(kstStampString(null)).toBeNull();
    expect(kstStampString("어제")).toBeNull();
  });
});
