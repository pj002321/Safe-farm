import { describe, expect, it } from "vitest";
import { kstDateString } from "./kstDate";

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
