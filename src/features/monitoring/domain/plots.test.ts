import { describe, expect, it } from "vitest";
import { DATA_SOURCES, PLOTS, SANGJU_TODAY } from "./plots";

/**
 * ---------------------------------------------
 * [Feature]: 필지·오늘 값 회귀 테스트
 *
 * [Description]
 * - 대부분 상수라 로직 테스트가 아니라 "지워지지 않았는지" 테스트다.
 *   진행 막대 비율이 1을 넘거나 kind 가 겹치면 화면이 틀린 채로 잘 그려진다.
 *   슬쩍 짧아지는 일을 막는 게 이 테스트의 목적이다.
 * ---------------------------------------------
 */
describe("PLOTS", () => {
  it("논·밭·과수 3종이고 kind 가 겹치지 않는다", () => {
    expect(PLOTS).toHaveLength(3);
    expect(new Set(PLOTS.map((plot) => plot.kind)).size).toBe(3);
  });

  it("진행 비율이 0~1 이고 라벨이 비어 있지 않다", () => {
    for (const plot of PLOTS) {
      expect(plot.progress.ratio).toBeGreaterThanOrEqual(0);
      expect(plot.progress.ratio).toBeLessThanOrEqual(1);
      expect(plot.progress.label.length).toBeGreaterThan(0);
    }
  });

  it("생육 단계와 설명·각주가 채워져 있다", () => {
    for (const plot of PLOTS) {
      expect(plot.stagesKo.length).toBeGreaterThan(0);
      expect(plot.bodyKo.length).toBeGreaterThan(0);
      expect(plot.noteKo.length).toBeGreaterThan(0);
    }
  });

  it("오늘 기온은 최저 < 최고 다", () => {
    for (const plot of PLOTS) {
      expect(plot.today.tempMinC).toBeLessThan(plot.today.tempMaxC);
    }
  });

  it("해발 158m 과수원이 74m 배추밭보다 서늘하다 (기온감률)", () => {
    const field = PLOTS.find((plot) => plot.kind === "field");
    const orchard = PLOTS.find((plot) => plot.kind === "orchard");
    expect(field).toBeDefined();
    expect(orchard).toBeDefined();
    if (!field || !orchard) return;
    expect(orchard.elevationM).toBeGreaterThan(field.elevationM);
    expect(orchard.today.tempMaxC).toBeLessThan(field.today.tempMaxC);
    expect(orchard.today.tempMinC).toBeLessThan(field.today.tempMinC);
  });
});

describe("SANGJU_TODAY · DATA_SOURCES", () => {
  it("오늘 값이 실측 범위를 벗어나지 않는다", () => {
    expect(SANGJU_TODAY.tempMinC).toBeLessThan(SANGJU_TODAY.tempMaxC);
    expect(SANGJU_TODAY.rain7dMm).toBeGreaterThanOrEqual(0);
    expect(SANGJU_TODAY.alertKo).toBe("가을가뭄");
  });

  it("출처 표기가 비어 있지 않다", () => {
    expect(DATA_SOURCES.length).toBeGreaterThan(0);
    for (const source of DATA_SOURCES) {
      expect(source.nameKo.length).toBeGreaterThan(0);
      expect(source.detailKo.length).toBeGreaterThan(0);
    }
  });
});
