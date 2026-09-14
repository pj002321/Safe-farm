import { describe, expect, it } from "vitest";
import {
  evaluateSprayHours,
  findWindows,
  SPRAY_LIMITS,
  SUN,
  TODAY_HOURLY,
  toMinutes,
} from "./drone";

const sunriseMinutes = toMinutes(SUN.riseKo);

describe("toMinutes", () => {
  it("자정 기준 분으로 바꾼다", () => {
    expect(toMinutes("06:07")).toBe(367);
    expect(toMinutes("00:00")).toBe(0);
    expect(toMinutes("23:59")).toBe(1439);
  });

  it("형식이 아니면 던진다 — 조용히 새벽 0시로 만들지 않는다", () => {
    // 0 을 돌려주면 모든 시간대가 "해 뜬 뒤"가 되어 하루 종일 방제 가능으로
    // 판정된다. 입력이 깨졌다는 사실이 드러나야 한다.
    expect(() => toMinutes("6시 7분")).toThrow();
    expect(() => toMinutes("")).toThrow();
    expect(() => toMinutes("0607")).toThrow();
  });
});

describe("evaluateSprayHours — 출처 PoC 의 판정을 재현한다", () => {
  const hours = evaluateSprayHours(TODAY_HOURLY, SPRAY_LIMITS, {
    sunriseMinutes,
  });
  const at = (hour: number) => {
    const found = hours.find((h) => h.hour === hour);
    if (!found) throw new Error(`${hour}시 예보가 없습니다`);
    return found;
  };

  it("해 뜨기 전(05시)은 막힌다", () => {
    expect(at(5).ok).toBe(false);
    expect(at(5).blockedByKo).toContain("해 뜨기 전");
  });

  it("07시·08시는 가능하다", () => {
    expect(at(7).ok).toBe(true);
    expect(at(8).ok).toBe(true);
  });

  it("09시는 아침 창(해 뜬 뒤 150분)을 지나 막힌다", () => {
    // 09:00 = 540분, 일출 367분 → 173분 경과 > 150분.
    // 습도·바람은 멀쩡한데 시간대만으로 막히는 경우라, 이유를 안 알려주면
    // 사용자가 왜 안 되는지 영영 모른다.
    expect(at(9).ok).toBe(false);
    expect(at(9).blockedByKo).toContain("아침 창 지남");
  });

  it("15시는 바람 3.9 > 3.0 으로 막힌다", () => {
    expect(at(15).ok).toBe(false);
    expect(at(15).blockedByKo).toContain("바람");
  });

  it("18시는 습도 57% < 60% 로 막힌다", () => {
    expect(at(18).blockedByKo).toContain("건조");
  });

  it("막힌 이유를 항상 함께 돌려준다", () => {
    for (const h of hours) {
      expect(h.ok).toBe(h.blockedByKo.length === 0);
    }
  });
});

describe("findWindows", () => {
  it("오늘 가능 구간은 07~08시 하나다", () => {
    const hours = evaluateSprayHours(TODAY_HOURLY, SPRAY_LIMITS, {
      sunriseMinutes,
    });
    expect(findWindows(hours)).toEqual([{ startHour: 7, endHour: 8 }]);
  });

  it("이어지지 않는 시간은 별개 구간으로 끊는다", () => {
    // 예보에 구멍이 있을 때 07시와 12시를 "07~12시"로 뭉뚱그리면
    // 사용자가 낮에 약을 치러 나간다.
    const hours = [
      { hour: 7, ok: true },
      { hour: 8, ok: true },
      { hour: 12, ok: true },
    ].map((h) => ({
      ...h,
      windMs: 1,
      humidityPct: 80,
      tempC: 20,
      rainProbPct: 0,
      windDirKo: "서",
      blockedByKo: [] as string[],
    }));
    expect(findWindows(hours)).toEqual([
      { startHour: 7, endHour: 8 },
      { startHour: 12, endHour: 12 },
    ]);
  });

  it("가능한 시간이 없으면 빈 배열", () => {
    const hours = TODAY_HOURLY.map((h) => ({
      ...h,
      ok: false,
      blockedByKo: ["바람"],
    }));
    expect(findWindows(hours)).toEqual([]);
  });
});
