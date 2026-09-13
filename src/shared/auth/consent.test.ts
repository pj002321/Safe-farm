import { describe, expect, it } from "vitest";
import {
  CONSENT_ITEMS,
  type Consent,
  isConsentComplete,
  parseConsent,
  toConsentMetadata,
} from "./consent";

const NONE: Consent = { terms: false, privacy: false, marketing: false };
const REQUIRED_ONLY: Consent = { terms: true, privacy: true, marketing: false };
const ALL: Consent = { terms: true, privacy: true, marketing: true };

describe("isConsentComplete", () => {
  it("필수 두 항목이 모두 있어야 통과한다", () => {
    expect(isConsentComplete(REQUIRED_ONLY)).toBe(true);
    expect(isConsentComplete(ALL)).toBe(true);
  });

  it("필수 항목이 하나라도 빠지면 통과하지 못한다", () => {
    expect(isConsentComplete(NONE)).toBe(false);
    expect(isConsentComplete({ ...REQUIRED_ONLY, terms: false })).toBe(false);
    expect(isConsentComplete({ ...REQUIRED_ONLY, privacy: false })).toBe(false);
  });

  it("선택 항목만으로는 통과하지 못한다", () => {
    expect(isConsentComplete({ ...NONE, marketing: true })).toBe(false);
  });
});

describe("parseConsent", () => {
  it("불리언 세 개가 제대로 담긴 객체는 그대로 통과한다", () => {
    expect(parseConsent(ALL)).toEqual(ALL);
    expect(parseConsent(REQUIRED_ONLY)).toEqual(REQUIRED_ONLY);
    expect(parseConsent(NONE)).toEqual(NONE);
  });

  it("객체가 아니면 전부 false 다", () => {
    expect(parseConsent(null)).toEqual(NONE);
    expect(parseConsent(undefined)).toEqual(NONE);
    expect(parseConsent("terms")).toEqual(NONE);
    expect(parseConsent(1)).toEqual(NONE);
    expect(parseConsent(true)).toEqual(NONE);
    expect(parseConsent([true, true, true])).toEqual(NONE);
  });

  it("빠진 필드는 false 로 채운다", () => {
    expect(parseConsent({})).toEqual(NONE);
    expect(parseConsent({ terms: true })).toEqual({ ...NONE, terms: true });
  });

  it("불리언이 아닌 값은 동의로 보지 않는다 — 애매하면 false", () => {
    expect(
      parseConsent({ terms: "true", privacy: 1, marketing: "on" }),
    ).toEqual(NONE);
    expect(parseConsent({ terms: {}, privacy: [], marketing: null })).toEqual(
      NONE,
    );
  });

  it("모르는 필드는 버리고 세 항목만 남긴다", () => {
    const parsed = parseConsent({
      ...ALL,
      isAdmin: true,
      terms_agreed_at: "2026-09-13T00:00:00.000Z",
    });

    expect(parsed).toEqual(ALL);
    expect(Object.keys(parsed).sort()).toEqual([
      "marketing",
      "privacy",
      "terms",
    ]);
  });
});

describe("CONSENT_ITEMS", () => {
  it("화면에 그리는 순서가 고정돼 있다", () => {
    expect(CONSENT_ITEMS.map((item) => item.key)).toEqual([
      "terms",
      "privacy",
      "marketing",
    ]);
  });

  it("필수 항목은 이용약관과 개인정보 둘뿐이다", () => {
    const required = CONSENT_ITEMS.filter((item) => item.required);
    expect(required.map((item) => item.key)).toEqual(["terms", "privacy"]);
  });

  it("모든 항목이 수집 내용을 설명하는 본문을 가진다", () => {
    for (const item of CONSENT_ITEMS) {
      expect(item.summary.length).toBeGreaterThan(0);
      expect(item.detail.length).toBeGreaterThan(0);
    }
  });
});

describe("toConsentMetadata", () => {
  it("필수 동의 시각을 기록하고 마케팅 여부를 그대로 싣는다", () => {
    const at = "2026-09-12T00:00:00.000Z";

    expect(toConsentMetadata(ALL, at)).toEqual({
      terms_agreed_at: at,
      privacy_agreed_at: at,
      marketing_opt_in: true,
    });
    expect(toConsentMetadata(REQUIRED_ONLY, at).marketing_opt_in).toBe(false);
  });
});
