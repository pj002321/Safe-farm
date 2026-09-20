import { describe, expect, it } from "vitest";
import { windArrowDeg, windDirectionKo, windLabelKo } from "./windText";

describe("windDirectionKo — 16방위", () => {
  it("네 기본 방위", () => {
    expect(windDirectionKo(0)).toBe("북");
    expect(windDirectionKo(90)).toBe("동");
    expect(windDirectionKo(180)).toBe("남");
    expect(windDirectionKo(270)).toBe("서");
  });

  it("사이 방위도 가른다", () => {
    expect(windDirectionKo(18)).toBe("북북동"); // 실측값
    expect(windDirectionKo(45)).toBe("북동");
    expect(windDirectionKo(315)).toBe("북서");
  });

  it("360 언저리는 다시 북이다", () => {
    // 348.75 이상은 북으로 감긴다. 나머지 연산이 없으면 배열 밖을 짚는다
    expect(windDirectionKo(350)).toBe("북");
    expect(windDirectionKo(359)).toBe("북");
    expect(windDirectionKo(360)).toBe("북");
  });

  it("범위를 벗어난 값도 감는다", () => {
    expect(windDirectionKo(450)).toBe("동"); // 450 - 360 = 90
    expect(windDirectionKo(-90)).toBe("서"); // -90 + 360 = 270
  });

  it("값이 없으면 null — 0 과 다르다", () => {
    // 0 은 정북풍이고 null 은 모른다는 뜻이다
    expect(windDirectionKo(0)).not.toBeNull();
    expect(windDirectionKo(null)).toBeNull();
    expect(windDirectionKo(undefined)).toBeNull();
    expect(windDirectionKo(Number.NaN)).toBeNull();
  });
});

describe("windLabelKo", () => {
  it("뒤에 '풍' 을 붙인다", () => {
    expect(windLabelKo(18)).toBe("북북동풍");
    expect(windLabelKo(270)).toBe("서풍");
  });

  it("값이 없으면 null", () => {
    expect(windLabelKo(null)).toBeNull();
  });
});

describe("windArrowDeg — 화살표는 반대쪽", () => {
  it("불어오는 쪽의 반대로 돌린다", () => {
    // 북풍(0도)은 북에서 남으로 분다 — 화살표는 남(180도)을 가리켜야 한다
    expect(windArrowDeg(0)).toBe(180);
    expect(windArrowDeg(90)).toBe(270);
  });

  it("360 을 넘으면 감는다", () => {
    expect(windArrowDeg(270)).toBe(90);
    expect(windArrowDeg(200)).toBe(20);
  });

  it("값이 없으면 null", () => {
    expect(windArrowDeg(null)).toBeNull();
    expect(windArrowDeg(Number.NaN)).toBeNull();
  });

  it("글자와 화살표는 늘 반대 방향이다", () => {
    // 이 관계가 깨지면 화면이 바람을 거꾸로 보여 준다
    for (const deg of [0, 18, 90, 180, 270, 359]) {
      const arrow = windArrowDeg(deg) as number;
      expect(Math.abs(((arrow - deg + 360) % 360) - 180)).toBeLessThan(0.001);
    }
  });
});
