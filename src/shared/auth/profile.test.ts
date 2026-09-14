import { describe, expect, it } from "vitest";
import {
  displayNameOf,
  hasCompletedConsent,
  type Profile,
  toProfile,
  USER_EDITABLE_PROFILE_FIELDS,
} from "./profile";

/** DB 가 돌려주는 행 모양. 컬럼 이름은 마이그레이션 SQL 과 1:1 이다. */
const row = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "a@test.com",
  role: "user",
  full_name: null,
  avatar_url: null,
  signup_provider: "email",
  terms_agreed_at: null,
  privacy_agreed_at: null,
  marketing_opt_in: false,
  created_at: "2026-09-14T00:00:00.000Z",
};

describe("toProfile", () => {
  it("스네이크 케이스 행을 화면 모양으로 바꾼다", () => {
    const profile = toProfile({
      ...row,
      full_name: "나농민",
      avatar_url: "https://example.com/a.png",
      signup_provider: "google",
      marketing_opt_in: true,
    });

    expect(profile).toEqual({
      id: row.id,
      email: "a@test.com",
      role: "user",
      fullName: "나농민",
      avatarUrl: "https://example.com/a.png",
      signupProvider: "google",
      termsAgreedAt: null,
      privacyAgreedAt: null,
      marketingOptIn: true,
      createdAt: row.created_at,
    });
  });

  it("role 은 'admin' 일 때만 admin 이다", () => {
    // DB 에 체크 제약이 있지만, 제약이 한 번 헐거워지거나 다른 경로로 값이
    // 들어왔을 때 임의 문자열이 관리자로 승격되면 안 된다.
    expect(toProfile({ ...row, role: "admin" }).role).toBe("admin");
    expect(toProfile({ ...row, role: "user" }).role).toBe("user");
    expect(toProfile({ ...row, role: "ADMIN" }).role).toBe("user");
    expect(toProfile({ ...row, role: "superuser" }).role).toBe("user");
    expect(toProfile({ ...row, role: "" }).role).toBe("user");
  });

  it("날짜는 문자열 그대로 통과시킨다", () => {
    // Server → Client 직렬화 경계에서 Date 는 문자열이 된다. 타입이
    // 거짓말하지 않게 처음부터 문자열로 맞춘다.
    const p = toProfile({ ...row, terms_agreed_at: "2026-01-01T00:00:00Z" });
    expect(p.termsAgreedAt).toBe("2026-01-01T00:00:00Z");
    expect(typeof p.createdAt).toBe("string");
  });
});

describe("displayNameOf", () => {
  const base = toProfile(row);

  it("이름이 있으면 이름을 쓴다", () => {
    expect(displayNameOf({ ...base, fullName: "나농민" })).toBe("나농민");
  });

  it("공백뿐인 이름은 없는 것으로 본다", () => {
    // "   " 를 그대로 쓰면 화면에 빈 자리가 생겨 이름이 사라진 것처럼 보인다.
    expect(displayNameOf({ ...base, fullName: "   " })).toBe("a");
  });

  it("이름이 없으면 이메일 앞부분", () => {
    expect(displayNameOf(base)).toBe("a");
  });

  it("이메일이 비정상이어도 빈 문자열을 내지 않는다", () => {
    // 화면에 아무것도 안 뜨는 것보다 "사용자"가 낫다.
    expect(displayNameOf({ ...base, email: "@x.com" })).toBe("사용자");
  });
});

describe("hasCompletedConsent", () => {
  const base = toProfile(row);

  it("둘 다 있어야 완료다", () => {
    const t = "2026-01-01T00:00:00Z";
    expect(hasCompletedConsent(base)).toBe(false);
    expect(hasCompletedConsent({ ...base, termsAgreedAt: t })).toBe(false);
    expect(hasCompletedConsent({ ...base, privacyAgreedAt: t })).toBe(false);
    expect(
      hasCompletedConsent({ ...base, termsAgreedAt: t, privacyAgreedAt: t }),
    ).toBe(true);
  });
});

describe("USER_EDITABLE_PROFILE_FIELDS", () => {
  it("role·email 이 들어있지 않다", () => {
    // 이 목록이 화면의 수정 폼을 만든다. role 이 섞이면 RLS 가 막더라도
    // 사용자에게 "바꿀 수 있다"는 잘못된 신호를 준다.
    const fields = USER_EDITABLE_PROFILE_FIELDS as readonly string[];
    expect(fields).not.toContain("role");
    expect(fields).not.toContain("email");
    expect(fields).not.toContain("id");
    expect(fields).not.toContain("createdAt");
  });

  it("전부 Profile 의 실제 키다", () => {
    const sample = toProfile(row);
    for (const field of USER_EDITABLE_PROFILE_FIELDS) {
      expect(Object.hasOwn(sample, field)).toBe(true);
    }
  });

  it("타입이 Profile 키로 제한된다 (컴파일 타임 보증)", () => {
    // satisfies 로 이미 막혀 있지만, 목록이 비면 검사가 무의미해지므로
    // 최소 하나는 있어야 한다.
    const fields: readonly (keyof Profile)[] = USER_EDITABLE_PROFILE_FIELDS;
    expect(fields.length).toBeGreaterThan(0);
  });
});
