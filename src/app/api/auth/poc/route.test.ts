import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 리다이렉트가 **상대 경로**인지 지킨다.
 *
 * 절대 주소를 만들려면 origin 이 필요한데, Railway 컨테이너 안에서 그 값은
 * 공개 주소가 아니라 내부 바인드 주소(`0.0.0.0:8080`)로 잡힌다. 브라우저가 갈
 * 곳이 없어 오류 화면이 뜨는데 로그인은 이미 끝나 쿠키가 심겨 있어서,
 * **새로고침하면 대시보드가 보이는** 기묘한 증상이 된다.
 *
 * `/auth/callback` 이 이 함정을 먼저 밟고 주석으로 남겼는데도 POC 라우트에서
 * 그대로 반복했다. 주석은 다음 사람이 안 읽으면 그만이라, 검사로 바꾼다.
 *
 * 소스를 읽어 확인하는 이유: 이 라우트는 Supabase 세션·쿠키를 건드려 단위
 * 테스트로 실행하려면 그 전부를 흉내 내야 한다. 여기서 막으려는 실수는
 * "절대 주소를 만들었다" 한 가지라, 그것만 보는 편이 정확하고 싸다.
 */

const SOURCE = readFileSync(
  new URL("./route.ts", import.meta.url),
  "utf8",
).replace(/^\s*(\/\/|\*|\/\*).*$/gm, ""); // 주석 제거 — 함정을 설명한 문장이 걸린다

describe("POC 로그인 라우트", () => {
  it("리다이렉트에 절대 주소를 만들지 않는다", () => {
    expect(SOURCE).not.toContain("NextResponse.redirect");
    expect(SOURCE).not.toMatch(/new URL\([^)]*request\.url/);
  });

  it("Location 헤더를 직접 세우고 303 을 쓴다", () => {
    expect(SOURCE).toMatch(/Location:\s*path/);
    expect(SOURCE).toContain("status: 303");
  });

  it("이메일을 요청에서 읽지 않는다 — 계정은 서버가 고른다", () => {
    expect(SOURCE).not.toMatch(
      /request\.(json|formData|nextUrl\.searchParams)/,
    );
  });

  it("공개 경로라 로그인 CSRF 를 막는다", () => {
    expect(SOURCE).toContain("sec-fetch-site");
  });

  it("스위치가 없으면 기능이 없는 것처럼 404 다", () => {
    expect(SOURCE).toContain("POC_PASSWORD");
    expect(SOURCE).toContain("status: 404");
  });
});
