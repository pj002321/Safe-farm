"use client";

import { useEffect, useState } from "react";
import { Color } from "three";

/**
 * ---------------------------------------------
 * [Feature]: 지구본 색 팔레트 (CSS 토큰 → THREE.Color)
 *
 * [Description]
 * - 3D 씬은 CSS 를 못 쓴다. 그래서 globals.css 의 시맨틱 토큰을 런타임에 읽어
 *   THREE.Color 로 옮긴다. 셰이더에 hex 를 박으면 테마 토글이 지구본만 비껴간다.
 * - 토큰 이름은 globals.css 2층(시맨틱)에서 가져온다. 무채색만 1층(--slate-*)을
 *   직접 읽는데, 우주 배경/별빛은 라이트·다크와 무관하게 항상 같은 값이어야 하기
 *   때문이다(히어로는 양쪽 테마에서 모두 밤하늘이다).
 * - **어두운 캔버스 보정**: 라이트 테마의 --telemetry 는 짙은 올리브(#4f7508)라
 *   밤하늘 위에서 사실상 보이지 않는다. 지구본은 테마와 무관하게 항상 어두운
 *   배경 위에 놓이므로, 읽어온 색의 명도가 낮으면 HSL 에서 끌어올린다.
 *   (색상(hue)은 보존하므로 브랜드 색 언어는 유지된다.)
 *
 * [Usage]
 * ```tsx
 * const colors = useThemeColors();
 * <meshBasicMaterial color={colors.telemetry} />
 * ```
 * ---------------------------------------------
 */

export interface GlobeColors {
  /** 브랜드 인디고 — 그래티큘·태양전지판 */
  accent: Color;
  /** 애시드 라임 — 관측 신호(림라이트·스캔·궤도선) */
  telemetry: Color;
  /** 점토색 — 육지 패치 */
  earth: Color;
  /** 경보 1단계 */
  caution: Color;
  /** 경보 2단계 */
  unsuitable: Color;
  /** 관심 단계 */
  info: Color;
  /** 우주 배경(바다의 바탕색이기도 하다) */
  space: Color;
  /** 별빛·보조선 */
  muted: Color;
}

/** 토큰이 비어 있을 때(SSR·테스트·스타일 미로드) 쓸 값. 라이트 테마 기준. */
const FALLBACK = {
  accent: "#5a41e0",
  telemetry: "#4f7508",
  earth: "#94603a",
  caution: "#b45309",
  unsuitable: "#cc2b4e",
  info: "#2b6ea8",
  space: "#0b0a12",
  muted: "#9998b3",
} as const;

/** 어두운 캔버스에서 색이 뭉개지지 않는 최소 명도. 0.52 아래는 밤하늘에 먹힌다. */
const MIN_LIGHTNESS = 0.52;
/** 명도를 끌어올릴 때 같이 확보하는 최소 채도. 안 하면 회색으로 뜬다. */
const MIN_SATURATION = 0.45;

const HSL_SCRATCH = { h: 0, s: 0, l: 0 };

function liftForDarkCanvas(color: Color): Color {
  color.getHSL(HSL_SCRATCH);
  if (HSL_SCRATCH.l < MIN_LIGHTNESS) {
    color.setHSL(
      HSL_SCRATCH.h,
      Math.max(HSL_SCRATCH.s, MIN_SATURATION),
      MIN_LIGHTNESS,
    );
  }
  return color;
}

function readToken(
  styles: CSSStyleDeclaration | null,
  name: string,
  fallback: string,
): Color {
  const raw = styles?.getPropertyValue(name).trim();
  // setStyle 은 파싱 실패 시 예외 대신 경고만 남기고 색을 그대로 둔다.
  // 그래서 빈 값은 넘기기 전에 걸러야 한다(검정 지구본이 되는 걸 막는다).
  return new Color(raw && raw.length > 0 ? raw : fallback);
}

/**
 * 현재 documentElement 에 적용된 테마 색을 한 번 읽는다.
 *
 * SSR 에서는 document 가 없으므로 폴백만 돌려준다. 값이 다르더라도 3D 캔버스는
 * 서버에서 그려지지 않으므로 하이드레이션 불일치가 생기지 않는다.
 */
export function readThemeColors(): GlobeColors {
  const styles =
    typeof document === "undefined"
      ? null
      : getComputedStyle(document.documentElement);

  return {
    accent: liftForDarkCanvas(readToken(styles, "--accent", FALLBACK.accent)),
    telemetry: liftForDarkCanvas(
      readToken(styles, "--telemetry", FALLBACK.telemetry),
    ),
    earth: liftForDarkCanvas(readToken(styles, "--earth", FALLBACK.earth)),
    caution: liftForDarkCanvas(
      readToken(styles, "--grade-caution", FALLBACK.caution),
    ),
    unsuitable: liftForDarkCanvas(
      readToken(styles, "--grade-unsuitable", FALLBACK.unsuitable),
    ),
    info: liftForDarkCanvas(readToken(styles, "--grade-info", FALLBACK.info)),
    // 우주와 별빛은 밝히지 않는다. 어두운 게 목적인 색이다.
    space: readToken(styles, "--slate-950", FALLBACK.space),
    muted: readToken(styles, "--slate-400", FALLBACK.muted),
  };
}

/**
 * 테마 변경을 따라가는 색 팔레트.
 *
 * 두 경로를 모두 구독해야 한다 — 사용자가 토글을 누르면 `data-theme` 속성이
 * 바뀌고, "system" 모드에서 OS 설정을 바꾸면 속성은 그대로인 채 미디어쿼리만
 * 바뀐다. 하나만 보면 절반의 경우에 지구본 색이 낡은 채로 남는다.
 */
export function useThemeColors(): GlobeColors {
  // 초기값은 폴백으로 두고 마운트 후에 실제 값을 읽는다.
  // SSR 결과와 첫 클라이언트 렌더를 일치시키기 위해서다.
  const [colors, setColors] = useState<GlobeColors>(readThemeColors);

  useEffect(() => {
    const sync = () => {
      setColors(readThemeColors());
    };
    sync();

    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributeFilter: ["data-theme"],
    });

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", sync);

    return () => {
      observer.disconnect();
      media.removeEventListener("change", sync);
    };
  }, []);

  return colors;
}
