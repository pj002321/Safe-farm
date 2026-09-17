import { describe, expect, it } from "vitest";
import {
  CARRY_OVER_DAYS,
  carryOverStart,
  daysOpenOf,
  kstDayStart,
  type TaskRow,
  toTaskCard,
} from "./taskSummary";

/**
 * 이 테스트의 전부는 **날짜 경계**다.
 *
 * 같은 종류의 함정에 한 번 빠진 적이 있다: 크론은 정각에 도는데 생성 시각은
 * 몇 분 뒤라, 순간(instant)끼리 빼면 매번 하루씩 밀렸다. 여기서도 같은 축이
 * 둘 있다 — KST/UTC 오프셋과 "N일째"의 셈법이다. 그래서 자정 직전·직후와
 * 정확히 N일째를 실제로 돌린다.
 */

/** KST 시각을 실제 시각(Date)으로. 테스트가 읽히게 하려고 둔다. */
function kst(iso: string): Date {
  return new Date(`${iso}+09:00`);
}

describe("kstDayStart", () => {
  it("KST 00:30 의 '오늘'은 그날이다 — UTC 로는 전날 15:30 이라 여기서 하루가 어긋난다", () => {
    // 이 시각을 UTC 기준으로 자르면 9/16 이 나온다. 그게 틀린 답이다.
    expect(kstDayStart(kst("2026-09-17T00:30:00"))).toEqual(
      kst("2026-09-17T00:00:00"),
    );
  });

  it("KST 23:59 도 같은 날이다", () => {
    expect(kstDayStart(kst("2026-09-17T23:59:59"))).toEqual(
      kst("2026-09-17T00:00:00"),
    );
  });

  it("자정 정각은 그날의 시작이지 전날의 끝이 아니다", () => {
    expect(kstDayStart(kst("2026-09-17T00:00:00"))).toEqual(
      kst("2026-09-17T00:00:00"),
    );
  });
});

describe("daysOpenOf", () => {
  it("같은 날이면 0 이다 — 배치가 00시에 돌고 사람이 06시에 봐도 '오늘'이다", () => {
    expect(
      daysOpenOf(kst("2026-09-17T00:03:00"), kst("2026-09-17T06:00:00")),
    ).toBe(0);
  });

  it("23:59 생성 → 다음날 00:01 조회는 1일째다. 2분 차이지만 날짜가 넘었다", () => {
    expect(
      daysOpenOf(kst("2026-09-16T23:59:00"), kst("2026-09-17T00:01:00")),
    ).toBe(1);
  });

  it("00:03 생성 → 같은 날 23:59 조회는 아직 0 이다. 24시간 가까이 지나도 같은 날이다", () => {
    expect(
      daysOpenOf(kst("2026-09-17T00:03:00"), kst("2026-09-17T23:59:00")),
    ).toBe(0);
  });

  it("사흘 뒤는 3 이다", () => {
    expect(
      daysOpenOf(kst("2026-09-14T00:03:00"), kst("2026-09-17T06:00:00")),
    ).toBe(3);
  });
});

describe("carryOverStart", () => {
  const now = kst("2026-09-17T06:00:00");

  it("오늘 00:00 KST 에서 CARRY_OVER_DAYS 만큼 거슬러 간 시각이다", () => {
    expect(carryOverStart(now)).toEqual(kst("2026-09-14T00:00:00"));
  });

  it("정확히 3일째 카드는 경계 위에 있어 포함된다 — 여기가 하루 밀리기 쉬운 자리다", () => {
    // 9/14 00:03 생성 = 3일째. 경계가 9/14 00:00 이므로 살아남아야 한다.
    const threeDaysOld = kst("2026-09-14T00:03:00");
    expect(threeDaysOld.getTime()).toBeGreaterThanOrEqual(
      carryOverStart(now).getTime(),
    );
    expect(daysOpenOf(threeDaysOld, now)).toBe(CARRY_OVER_DAYS);
  });

  it("4일째 카드는 경계 밖이라 이전 기록으로 넘어간다", () => {
    const fourDaysOld = kst("2026-09-13T23:59:00");
    expect(fourDaysOld.getTime()).toBeLessThan(carryOverStart(now).getTime());
    expect(daysOpenOf(fourDaysOld, now)).toBe(4);
  });
});

describe("toTaskCard", () => {
  const row: TaskRow = {
    id: "t1",
    plot_id: "p1",
    title: "물 주기",
    reason: "이레 강수량 0.1mm",
    priority: "high",
    done: false,
    done_at: null,
    expired_at: null,
    generated_at: kst("2026-09-15T00:03:00").toISOString(),
    plots: { name: "상주 배추밭" },
  };

  it("daysOpen 을 채운다", () => {
    const card = toTaskCard(row, kst("2026-09-17T06:00:00"));
    expect(card.daysOpen).toBe(2);
    expect(card.titleKo).toBe("물 주기");
    expect(card.plotKo).toBe("상주 배추밭");
    expect(card.plotId).toBe("p1");
    expect(card.expired).toBe(false);
  });

  it("배치가 닫은 카드는 expired 다 — 이력이 '안 함'으로 표시하는 근거", () => {
    const card = toTaskCard(
      { ...row, expired_at: kst("2026-09-18T00:01:00").toISOString() },
      kst("2026-09-18T06:00:00"),
    );
    expect(card.expired).toBe(true);
  });

  it("밭 이름이 없어도 죽지 않는다", () => {
    const card = toTaskCard(
      { ...row, plots: null },
      kst("2026-09-17T06:00:00"),
    );
    expect(card.plotKo).toBe("이름 없는 밭");
  });
});
