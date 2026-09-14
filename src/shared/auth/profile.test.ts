import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DocumentData } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import {
  displayNameOf,
  hasCompletedConsent,
  toProfile,
  USER_EDITABLE_PROFILE_FIELDS,
} from "./profile";

/**
 * `getCurrentProfile` · `upsertProfileFromToken` 은 Admin SDK 를 타므로 여기서
 * 다루지 않는다. 이 파일은 Firestore 문서 → 화면 모델 변환과 파생값만 본다 —
 * 전부 순수 함수다.
 */

const UID = "kTq0Zx7bQwZ1a2b3c4d5e6f7g8h9";

/** Admin SDK 의 Timestamp 를 흉내 낸다 — `toProfile` 이 보는 것은 toDate() 뿐이다. */
const stamp = (iso: string) => ({ toDate: () => new Date(iso) });

const DOC: DocumentData = {
  email: "farmer@example.com",
  fullName: "김농부",
  avatarUrl: "https://lh3.example/a.jpg",
  signupProvider: "google.com",
  termsAgreedAt: stamp("2026-09-12T01:00:00.000Z"),
  privacyAgreedAt: stamp("2026-09-12T01:00:00.000Z"),
  marketingOptIn: true,
  createdAt: stamp("2026-09-12T01:00:00.000Z"),
};

describe("toProfile", () => {
  it("Firestore 문서를 화면 모델로 옮긴다", () => {
    expect(toProfile(UID, DOC)).toEqual({
      id: UID,
      email: "farmer@example.com",
      fullName: "김농부",
      role: "user",
      avatarUrl: "https://lh3.example/a.jpg",
      signupProvider: "google.com",
      termsAgreedAt: "2026-09-12T01:00:00.000Z",
      privacyAgreedAt: "2026-09-12T01:00:00.000Z",
      marketingOptIn: true,
      createdAt: "2026-09-12T01:00:00.000Z",
    });
  });

  it("Timestamp · Date · ISO 문자열을 모두 ISO 로 정규화한다", () => {
    const iso = "2026-09-12T01:00:00.000Z";

    expect(toProfile(UID, { ...DOC, createdAt: stamp(iso) }).createdAt).toBe(
      iso,
    );
    expect(toProfile(UID, { ...DOC, createdAt: new Date(iso) }).createdAt).toBe(
      iso,
    );
    expect(toProfile(UID, { ...DOC, createdAt: iso }).createdAt).toBe(iso);
  });

  it("null 필드를 null 로 보존한다 — 빈 문자열로 바꾸지 않는다", () => {
    const profile = toProfile(UID, {
      ...DOC,
      fullName: null,
      avatarUrl: null,
      termsAgreedAt: null,
      privacyAgreedAt: null,
    });

    expect(profile.fullName).toBeNull();
    expect(profile.avatarUrl).toBeNull();
    expect(profile.termsAgreedAt).toBeNull();
    expect(profile.privacyAgreedAt).toBeNull();
  });

  it("모르는 시각 형식은 던진다 — 조용히 null 로 바꾸면 동의 기록이 사라진다", () => {
    expect(() => toProfile(UID, { ...DOC, termsAgreedAt: 1757640000 })).toThrow(
      /termsAgreedAt/,
    );
  });

  it("createdAt 이 없으면 던진다 — 우리가 쓴 문서라면 항상 있어야 한다", () => {
    expect(() => toProfile(UID, { ...DOC, createdAt: null })).toThrow(
      /createdAt/,
    );
  });
});

describe("역할(role)", () => {
  it("문서의 admin 을 그대로 읽는다", () => {
    expect(toProfile(UID, { ...DOC, role: "admin" }).role).toBe("admin");
  });

  it("모르는 값·누락은 user 로 떨어뜨린다 — 애매할 때 admin 이 되면 권한 상승이다", () => {
    for (const value of [undefined, null, "", "Admin", "ADMIN", true, 1, {}]) {
      expect(toProfile(UID, { ...DOC, role: value }).role).toBe("user");
    }
  });
});

describe("displayNameOf", () => {
  it("이름이 있으면 이름을 쓴다", () => {
    expect(displayNameOf(toProfile(UID, DOC))).toBe("김농부");
  });

  it("이름이 없으면 이메일 아이디 부분으로 대신한다", () => {
    expect(displayNameOf(toProfile(UID, { ...DOC, fullName: null }))).toBe(
      "farmer",
    );
  });

  it("공백만 있는 이름은 없는 것으로 본다", () => {
    expect(displayNameOf(toProfile(UID, { ...DOC, fullName: "   " }))).toBe(
      "farmer",
    );
  });

  it("이름도 이메일 아이디도 비면 기본값을 쓴다 — 빈 문자열을 내보내지 않는다", () => {
    const profile = toProfile(UID, {
      ...DOC,
      fullName: null,
      email: "@example.com",
    });
    expect(displayNameOf(profile)).toBe("농부");
  });
});

describe("hasCompletedConsent", () => {
  it("필수 동의 시각이 둘 다 있어야 true 다", () => {
    expect(hasCompletedConsent(toProfile(UID, DOC))).toBe(true);
  });

  it("하나라도 비면 false — 로그인 경로로 만들어진 구글 계정이 이 경우다", () => {
    expect(
      hasCompletedConsent(toProfile(UID, { ...DOC, termsAgreedAt: null })),
    ).toBe(false);
    expect(
      hasCompletedConsent(toProfile(UID, { ...DOC, privacyAgreedAt: null })),
    ).toBe(false);
  });
});

/**
 * 보안 규칙은 번들 밖(`firestore.rules`)에 있어 타입 검사가 닿지 않는다.
 * 코드가 "사용자가 고칠 수 있다"고 보는 필드와 규칙이 허용하는 필드가 어긋나면,
 * 저장이 조용히 거부되거나 잠갔어야 할 필드가 열린다. 둘 다 화면만 봐서는
 * 알 수 없는 종류의 고장이라 여기서 대조한다.
 */
describe("firestore.rules 와의 계약", () => {
  const rules = readFileSync(join(process.cwd(), "firestore.rules"), "utf8");

  it("수정 허용 필드 목록이 규칙의 hasOnly 와 일치한다", () => {
    const match = rules.match(/hasOnly\(\[([^\]]*)\]\)/);
    expect(match).not.toBeNull();

    const inRules = (match?.[1] ?? "")
      .split(",")
      .map((raw) => raw.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean)
      .sort();

    expect(inRules).toEqual([...USER_EDITABLE_PROFILE_FIELDS].sort());
  });

  it("모든 문서를 거부하는 catch-all 규칙이 남아 있다", () => {
    // 빠뜨리면 새 컬렉션을 추가하는 순간 기본 공개가 된다.
    expect(rules).toMatch(/match\s*\/\{document=\*\*\}/);
    expect(rules).toMatch(/allow\s+read,\s*write:\s*if\s+false/);
  });
});
