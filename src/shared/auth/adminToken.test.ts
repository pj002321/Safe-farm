import { describe, expect, it } from "vitest";
import {
  passwordMatches,
  signAdminToken,
  verifyAdminToken,
} from "./adminToken";

describe("adminToken", () => {
  const now = 1_000_000;

  it("같은 비밀로 서명한 만료 전 토큰만 통과한다", () => {
    const token = signAdminToken("secret-1", now + 1000);
    expect(verifyAdminToken("secret-1", token, now)).toBe(true);
    expect(verifyAdminToken("secret-2", token, now)).toBe(false);
    expect(verifyAdminToken("secret-1", token, now + 1000)).toBe(false);
  });

  it("만료 시각을 고치면 서명이 맞지 않는다", () => {
    const [, signature] = signAdminToken("secret-1", now + 1000).split(".");
    expect(
      verifyAdminToken("secret-1", `${now + 9_999_999}.${signature}`, now),
    ).toBe(false);
    expect(verifyAdminToken("secret-1", undefined, now)).toBe(false);
    expect(verifyAdminToken("secret-1", "garbage", now)).toBe(false);
  });

  it("비밀번호는 정확히 같을 때만 맞는다", () => {
    expect(passwordMatches("pw-long-enough", "pw-long-enough")).toBe(true);
    expect(passwordMatches("pw-long-enough", "pw")).toBe(false);
  });
});
