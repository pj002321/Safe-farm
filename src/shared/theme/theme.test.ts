import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME,
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

  it("저장된 선택이 없으면 OS 설정을 따른다", () => {
    // 기본값이 "system" 이라는 말은, 스크립트가 고정 색을 칠하는 대신
    // prefers-color-scheme 을 읽어야 한다는 뜻이다. 이 테스트가 깨지면
    // theme.ts 의 계약과 스크립트의 실제 동작이 어긋난 것이다.
    expect(DEFAULT_THEME).toBe("system");
    expect(source).toContain("prefers-color-scheme: dark");
    // 명시적으로 고른 값은 그대로 쓴다(둘 다 인정해야 토글이 양방향으로 산다).
    expect(source).toContain('stored === "light"');
    expect(source).toContain('stored === "dark"');
  });

  it("고른 값이 없을 때만 OS 변경을 구독한다", () => {
    // 토글로 고른 값을 OS 설정이 덮으면 안 된다. 구독이 조건 없이 걸려 있으면
    // 사용자가 라이트를 골라도 OS 가 다크로 바뀌는 순간 화면이 뒤집힌다.
    expect(source).toMatch(/if\s*\(!chosen/);
    expect(source).toMatch(/addEventListener\(\s*"change"/);
  });

  it("속성을 항상 세팅하고 절대 지우지 않는다", () => {
    // 속성을 지우고 CSS 의 prefers-color-scheme 에 맡기면 토글이 현재 테마를
    // 읽을 곳이 없어진다. 부트스트랩이 OS 선호를 값으로 박아 두는 편이 낫다.
    // 포매터가 인자를 줄바꿈할 수 있으므로 정규식으로 본다 — 계약은
    // "data-theme 을 세팅한다"이지 "한 줄로 쓴다"가 아니다.
    expect(source).toMatch(/setAttribute\(\s*"data-theme"/);
    expect(source).not.toContain("removeAttribute");
  });

  it("localStorage 접근을 try/catch 로 감싼다", () => {
    // Safari 프라이빗 모드는 접근만으로 SecurityError 를 던진다.
    // 감싸지 않으면 이 스크립트가 죽고 이후 <head> 파싱이 멈춘다.
    expect(source).toMatch(/try\s*\{/);
    expect(source).toMatch(/catch/);
  });
});
