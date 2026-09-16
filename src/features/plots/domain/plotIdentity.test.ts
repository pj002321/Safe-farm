import { describe, expect, it } from "vitest";
import { PLOT_TONE_COUNT, plotToneIndex } from "./plotIdentity";

/** 실제 uuid 모양. 앞자리가 비슷해도 색이 갈려야 한다. */
function uuid(n: number): string {
  return `aaaaaaaa-0000-0000-0000-${String(n).padStart(12, "0")}`;
}

describe("plotToneIndex", () => {
  it("같은 id 면 언제나 같은 색이다 — 새로 고칠 때마다 바뀌면 안 된다", () => {
    const id = uuid(1);
    expect(plotToneIndex(id)).toBe(plotToneIndex(id));
  });

  it("항상 배열 범위 안이다", () => {
    for (let i = 0; i < 500; i += 1) {
      const index = plotToneIndex(uuid(i));
      expect(Number.isInteger(index)).toBe(true);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(PLOT_TONE_COUNT);
    }
  });

  it("빈 문자열도 범위 안이다 — 화면이 undefined 를 그리면 안 된다", () => {
    const index = plotToneIndex("");
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(PLOT_TONE_COUNT);
  });

  it("앞자리가 같은 uuid 들도 색이 갈린다 — 한 색으로 뭉치면 뿌린 의미가 없다", () => {
    const used = new Set<number>();
    for (let i = 0; i < 40; i += 1) used.add(plotToneIndex(uuid(i)));
    expect(used.size).toBe(PLOT_TONE_COUNT);
  });

  it("색이 고르게 퍼진다 — 한 색에 절반 넘게 몰리지 않는다", () => {
    const counts = new Array(PLOT_TONE_COUNT).fill(0);
    const total = 1000;
    for (let i = 0; i < total; i += 1) counts[plotToneIndex(uuid(i))] += 1;

    for (const count of counts) {
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(total / 2);
    }
  });

  it("한 글자만 달라도 색이 달라질 수 있다 — 해시가 하위 비트를 버리지 않는다", () => {
    const a = plotToneIndex("plot-aaaaaaaaaaaaaaaa");
    const b = plotToneIndex("plot-aaaaaaaaaaaaaaab");
    const c = plotToneIndex("plot-aaaaaaaaaaaaaaac");
    // 셋이 전부 같으면 하위 비트가 날아갔다는 뜻이다.
    expect(new Set([a, b, c]).size).toBeGreaterThan(1);
  });
});
