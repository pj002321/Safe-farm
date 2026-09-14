/**
 * ---------------------------------------------
 * [Feature]: 화면 표시용 포맷터
 *
 * [Description]
 * - 여러 feature가 같은 방식으로 값을 보여줘야 할 때만 여기 둔다.
 *   한 feature에서만 쓰는 포맷은 그 feature 안에 둘 것.
 * - `utils`가 잡동사니 서랍이 되지 않게 하는 규칙:
 *   **파일명이 책임을 말해야 한다.** `utils.ts` 같은 파일은 만들지 않는다.
 *   포맷은 format.ts, 날짜 계산은 date.ts, 이런 식으로 목적별로 쪼갠다.
 * - 순수 함수만. 여기서 fetch·DB·환경변수를 읽지 않는다.
 *
 * [Usage]
 * ```ts
 * import { formatTemperature, formatScore } from "@/shared/utils/format";
 * formatTemperature(22.456)  // "22.5°C"
 * formatScore(87)            // "87점"
 * ```
 * ---------------------------------------------
 */

/** 기온을 소수 첫째 자리까지 표시한다. 관측값이 없으면 대시. */
export function formatTemperature(celsius: number | null | undefined): string {
  if (celsius === null || celsius === undefined || Number.isNaN(celsius)) {
    return "—";
  }
  return `${celsius.toFixed(1)}°C`;
}

/** 강수량. 1mm 미만은 관측 관행대로 "0.0mm" 대신 "미량"으로 표시한다. */
export function formatRainfall(mm: number | null | undefined): string {
  if (mm === null || mm === undefined || Number.isNaN(mm)) return "—";
  if (mm > 0 && mm < 1) return "미량";
  return `${Math.round(mm)}mm`;
}

/** 적합도 점수. 0~100 정수 전제. */
export function formatScore(score: number): string {
  return `${Math.round(score)}점`;
}

/** 날짜를 "9월 9일 (화)" 형태로. 농민이 요일을 먼저 본다는 전제. */
export function formatFarmDate(date: Date, locale = "ko-KR"): string {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}
