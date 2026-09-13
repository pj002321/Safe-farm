import { describe, expect, it } from "vitest";
import { DEFAULT_AFTER_LOGIN, safeNextPath } from "./redirect";

/**
 * ---------------------------------------------
 * [Feature]: safeNextPath 회귀 테스트
 *
 * [Description]
 * - 열린 리다이렉트는 눈으로 검증할 수 없는 종류의 결함이다. 화면은 멀쩡히
 *   동작하고, 뚫렸다는 사실은 피싱 신고가 들어와야 안다. 그래서 이 함수만은
 *   순수 함수 테스트를 남긴다.
 * - 통과 케이스보다 **막아야 하는 케이스**가 본체다.
 * ---------------------------------------------
 */
describe("safeNextPath", () => {
  it("내부 경로는 그대로 통과시킨다", () => {
    expect(safeNextPath("/admin")).toBe("/admin");
    expect(safeNextPath("/dashboard?crop=tomato")).toBe(
      "/dashboard?crop=tomato",
    );
  });

  it("값이 없으면 앱 홈으로 보낸다", () => {
    expect(safeNextPath(null)).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeNextPath("")).toBe(DEFAULT_AFTER_LOGIN);
  });

  it("외부로 나가는 값은 전부 막는다", () => {
    // 절대 URL
    expect(safeNextPath("https://evil.test")).toBe(DEFAULT_AFTER_LOGIN);
    // 프로토콜 상대 URL
    expect(safeNextPath("//evil.test")).toBe(DEFAULT_AFTER_LOGIN);
    // 브라우저가 "//" 로 정규화하는 역슬래시
    expect(safeNextPath("/\\evil.test")).toBe(DEFAULT_AFTER_LOGIN);
    // 브라우저가 떼어내는 제어문자를 끼워 넣은 우회
    expect(safeNextPath("/\t/evil.test")).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeNextPath("/\n/evil.test")).toBe(DEFAULT_AFTER_LOGIN);
    // 앞에 슬래시가 없는 상대 경로 (문서 위치에 따라 어디로 갈지 모른다)
    expect(safeNextPath("evil.test")).toBe(DEFAULT_AFTER_LOGIN);
  });
});
