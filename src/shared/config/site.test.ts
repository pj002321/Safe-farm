import { describe, expect, it } from "vitest";
import { resolveSiteUrl } from "./site";

describe("resolveSiteUrl", () => {
  it("아무것도 없으면 localhost:3000", () => {
    expect(resolveSiteUrl({}).toString()).toBe("http://localhost:3000/");
  });

  it("PORT 를 존중한다", () => {
    expect(resolveSiteUrl({ PORT: "4000" }).toString()).toBe(
      "http://localhost:4000/",
    );
  });

  it("Firebase 프로젝트 ID 가 있으면 기본 호스팅 도메인을 쓴다", () => {
    const url = resolveSiteUrl({
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "safe-farm-ai",
    });

    expect(url.toString()).toBe("https://safe-farm-ai.web.app/");
  });

  it("NEXT_PUBLIC_SITE_URL 이 가장 우선한다 — 커스텀 도메인을 붙였을 때", () => {
    const url = resolveSiteUrl({
      NEXT_PUBLIC_SITE_URL: "https://safefarm.kr",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "safe-farm-ai",
    });

    expect(url.toString()).toBe("https://safefarm.kr/");
  });

  it("항상 절대 URL 을 돌려준다 — 상대 경로가 새어나가지 않는다", () => {
    for (const env of [
      {},
      { PORT: "4000" },
      { NEXT_PUBLIC_FIREBASE_PROJECT_ID: "safe-farm-ai" },
      { NEXT_PUBLIC_SITE_URL: "https://safefarm.kr" },
    ]) {
      expect(resolveSiteUrl(env).protocol).toMatch(/^https?:$/);
    }
  });
});
