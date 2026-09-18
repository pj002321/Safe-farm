import { describe, expect, it } from "vitest";
import {
  DEFAULT_MATURITY,
  MATURITY_FALLBACK_ORDER,
  MATURITY_LABEL_KO,
  MATURITY_TYPES,
  toMaturityType,
} from "./maturity";

describe("숙기 어휘", () => {
  it("차례가 조·중·만이다 — 라디오가 이 순서로 그린다", () => {
    expect(MATURITY_TYPES).toEqual(["EARLY", "MID", "LATE"]);
  });

  it("세 코드 전부에 라벨이 있다", () => {
    for (const m of MATURITY_TYPES) expect(MATURITY_LABEL_KO[m]).toBeTruthy();
  });

  it("기본값은 대체 순서의 첫 칸과 같다 — 화면과 서버가 같은 것을 고른다", () => {
    expect(MATURITY_FALLBACK_ORDER[0]).toBe(DEFAULT_MATURITY);
  });

  it("대체 순서는 세 코드를 빠짐없이 한 번씩 담는다", () => {
    expect([...MATURITY_FALLBACK_ORDER].sort()).toEqual(
      [...MATURITY_TYPES].sort(),
    );
  });
});

describe("toMaturityType", () => {
  it("셋 중 하나면 그대로", () => {
    expect(toMaturityType("LATE")).toBe("LATE");
  });

  it("아니면 null — 폼 밖에서 온 글자를 DB CHECK 까지 보내지 않는다", () => {
    expect(toMaturityType("late")).toBeNull();
    expect(toMaturityType("만생종")).toBeNull();
    expect(toMaturityType("")).toBeNull();
    expect(toMaturityType(null)).toBeNull();
    expect(toMaturityType(undefined)).toBeNull();
    expect(toMaturityType(3)).toBeNull();
  });
});
