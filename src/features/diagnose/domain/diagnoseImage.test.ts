import { describe, expect, it } from "vitest";
import {
  MAX_IMAGE_DATA_URL_CHARS,
  parseDiagnoseQuestion,
  parseImageDataUrl,
} from "./diagnoseImage";

describe("parseImageDataUrl", () => {
  it("허용된 형식은 통과한다", () => {
    expect(parseImageDataUrl("data:image/jpeg;base64,AAAA")).toEqual({
      ok: true,
      value: "data:image/jpeg;base64,AAAA",
    });
  });

  it("이미지가 아니거나 비어 있으면 거절한다", () => {
    expect(parseImageDataUrl("data:text/plain;base64,AAAA").ok).toBe(false);
    expect(parseImageDataUrl("").ok).toBe(false);
    expect(parseImageDataUrl(undefined).ok).toBe(false);
  });

  it("상한을 넘으면 거절한다", () => {
    const oversized = `data:image/png;base64,${"A".repeat(MAX_IMAGE_DATA_URL_CHARS)}`;
    expect(parseImageDataUrl(oversized).ok).toBe(false);
  });
});

describe("parseDiagnoseQuestion", () => {
  it("비어 있으면 null — 서버에 빈 문자열을 보내지 않는다", () => {
    expect(parseDiagnoseQuestion("   ")).toBeNull();
    expect(parseDiagnoseQuestion(undefined)).toBeNull();
  });

  it("값이 있으면 앞뒤 공백만 걷는다", () => {
    expect(parseDiagnoseQuestion("  잎이 왜 노래져요?  ")).toBe(
      "잎이 왜 노래져요?",
    );
  });
});
