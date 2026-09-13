import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveTheme,
  THEME_INIT_SRC,
  THEME_STORAGE_KEY,
  type ThemeMode,
} from "./theme";

describe("resolveTheme", () => {
  it("명시적으로 고른 값은 OS 설정을 무시한다", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("system 이면 OS 선호를 따른다", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("적용 테마는 언제나 light 또는 dark 다 — system 이 그대로 새어나가지 않는다", () => {
    const modes: ThemeMode[] = ["light", "dark", "system"];
    for (const mode of modes) {
      for (const prefersDark of [true, false]) {
        expect(["light", "dark"]).toContain(resolveTheme(mode, prefersDark));
      }
    }
  });
});

/**
 * 부트스트랩 스크립트는 번들 밖(`public/`)에 있어서 타입 검사가 닿지 않는다.
 * 그래서 두 파일이 같은 계약을 보는지 여기서 확인한다 — 어긋나면 토글이 저장한
 * 값을 스크립트가 못 읽어 **새로고침할 때마다 테마가 풀린다.** 화면을 열어보기
 * 전까지 아무도 모르는 종류의 고장이라 테스트로 묶어 둔다.
 */
describe("public/theme-init.js 와의 계약", () => {
  const source = readFileSync(
    join(process.cwd(), "public", "theme-init.js"),
    "utf8",
  );

  it("THEME_INIT_SRC 가 가리키는 파일이 실제로 존재한다", () => {
    expect(THEME_INIT_SRC).toBe("/theme-init.js");
    expect(source.length).toBeGreaterThan(0);
  });

  it("같은 localStorage 키를 본다", () => {
    expect(source).toContain(`"${THEME_STORAGE_KEY}"`);
  });

  it("light/dark 만 속성으로 쓰고, 그 외에는 속성을 지운다", () => {
    // "system" 이나 쓰레기 값일 때 속성을 남기면 globals.css 의
    // prefers-color-scheme 블록이 죽어 OS 설정 변경이 반영되지 않는다.
    expect(source).toContain("removeAttribute");
    expect(source).toContain('setAttribute("data-theme"');
  });

  it("localStorage 접근을 try/catch 로 감싼다", () => {
    // Safari 프라이빗 모드는 접근만으로 SecurityError 를 던진다.
    // 감싸지 않으면 이 스크립트가 죽고 이후 <head> 파싱이 멈춘다.
    expect(source).toMatch(/try\s*\{/);
    expect(source).toMatch(/catch/);
  });
});
