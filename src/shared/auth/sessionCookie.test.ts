import { describe, expect, it } from "vitest";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_MS,
  SESSION_MAX_AGE_SECONDS,
  sessionCookieOptions,
} from "./sessionCookie";

/**
 * ---------------------------------------------
 * [Feature]: 세션 쿠키 규격 회귀 테스트
 *
 * [Description]
 * - 여기서 잡는 결함은 전부 "화면에서는 안 보이는" 종류다. secure 를 로컬에서
 *   켜면 쿠키가 저장되지 않고, maxAge 단위를 틀리면 수명이 1000배가 되며,
 *   14일을 넘기면 Firebase 가 런타임에 거절한다. 셋 다 타입 검사로는 못 잡는다.
 * ---------------------------------------------
 */
describe("sessionCookieOptions", () => {
  it("운영에서만 secure 를 켠다", () => {
    expect(sessionCookieOptions(true).secure).toBe(true);
    // 로컬은 http 라 secure 를 켜면 쿠키가 아예 저장되지 않는다.
    expect(sessionCookieOptions(false).secure).toBe(false);
  });

  it("고정 옵션은 환경과 무관하게 같다", () => {
    for (const isProduction of [true, false]) {
      const options = sessionCookieOptions(isProduction);
      expect(options.httpOnly).toBe(true);
      // strict 로 올리면 외부 링크 유입 시 로그아웃처럼 보인다.
      expect(options.sameSite).toBe("lax");
      expect(options.path).toBe("/");
    }
  });

  it("maxAge 는 초 단위이고 Firebase 상한(14일)을 넘지 않는다", () => {
    expect(sessionCookieOptions(true).maxAge).toBe(SESSION_MAX_AGE_SECONDS);
    expect(SESSION_MAX_AGE_SECONDS).toBe(SESSION_MAX_AGE_MS / 1000);
    expect(SESSION_MAX_AGE_MS).toBeLessThanOrEqual(14 * 24 * 60 * 60 * 1000);
    // 하한도 있다. 5분 미만이면 createSessionCookie 가 거절한다.
    expect(SESSION_MAX_AGE_MS).toBeGreaterThanOrEqual(5 * 60 * 1000);
  });

  it("쿠키 이름은 Firebase Hosting 규약을 따른다", () => {
    expect(SESSION_COOKIE).toBe("__session");
  });
});
