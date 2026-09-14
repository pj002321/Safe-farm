import { describe, expect, it } from "vitest";
import {
  isInvalidSessionError,
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

/**
 * 이 판정이 틀리면 **배포에서만** 터진다. 로컬은 서비스 계정 키 파일을 쓰므로
 * 권한이 완전하고, Cloud Run 은 ADC 라 IAM 역할이 모자랄 수 있다. 그때 오류가
 * "로그인 안 함"으로 둔갑하면 전 사용자가 로그 없이 /login 루프를 돈다.
 * 화면을 열어보기 전까지 아무도 모르는 종류의 고장이라 테스트로 묶어 둔다.
 */
describe("isInvalidSessionError", () => {
  /** firebase-admin 이 던지는 모양. code 만 본다. */
  const err = (code: unknown) => ({ code });

  it("토큰 문제는 삼킨다 — 다시 로그인하면 풀리는 것들", () => {
    for (const code of [
      "auth/session-cookie-expired",
      "auth/session-cookie-revoked",
      "auth/invalid-session-cookie-duration",
      "auth/id-token-expired",
      "auth/id-token-revoked",
      "auth/invalid-id-token",
      "auth/argument-error",
      "auth/user-disabled",
      // checkRevoked 가 켜져 있어 getUser() 가 붙는다. 삭제된 사용자는
      // 설정 오류가 아니라 "더는 로그인 상태가 아님"이다.
      "auth/user-not-found",
    ]) {
      expect(isInvalidSessionError(err(code))).toBe(true);
    }
  });

  it("설정·권한 오류는 삼키지 않는다 — 이게 이 함수의 존재 이유다", () => {
    for (const code of [
      // Cloud Run 런타임 SA 에 firebaseauth.users.get 이 없을 때.
      // error.js:603 이 PERMISSION_DENIED 를 여기로 매핑한다.
      "auth/insufficient-permission",
      // 403 이 JSON 이 아닐 때의 폴백. 같은 원인, 다른 표면.
      "auth/internal-error",
      "auth/configuration-not-found",
      "auth/invalid-credential",
      "auth/project-not-found",
      "auth/quota-exceeded",
    ]) {
      expect(isInvalidSessionError(err(code))).toBe(false);
    }
  });

  it("auth/ 가 아닌 실패는 전부 던진다", () => {
    expect(isInvalidSessionError(err("app/network-error"))).toBe(false);
    expect(isInvalidSessionError(err("ENOTFOUND"))).toBe(false);
    expect(isInvalidSessionError(new Error("서비스 계정 키가 없습니다"))).toBe(
      false,
    );
  });

  it("code 가 없거나 이상한 값이면 던진다 — 모르는 실패를 삼키지 않는다", () => {
    expect(isInvalidSessionError(null)).toBe(false);
    expect(isInvalidSessionError(undefined)).toBe(false);
    expect(isInvalidSessionError("auth/session-cookie-expired")).toBe(false);
    expect(isInvalidSessionError(err(undefined))).toBe(false);
    expect(isInvalidSessionError(err(42))).toBe(false);
    expect(isInvalidSessionError({})).toBe(false);
  });
});
