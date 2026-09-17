/**
 * ---------------------------------------------
 * [Feature]: 한국 기준 "오늘" 한 줄
 *
 * [Description]
 * - 관측일(`weather_obs_daily.obs_date`)과 파종일은 **한국 달력 날짜**다. 서버가
 *   UTC 로 도는 환경에서 `toISOString().slice(0, 10)` 을 쓰면 한국 시간 오전
 *   9시 이전에 하루 전 날짜가 나와, 누적 GDD 에서 하루가 통째로 빠진다.
 * - `en-CA` 로케일을 쓰는 이유는 그 로케일의 기본 표기가 `YYYY-MM-DD` 라서다.
 *   직접 문자열을 조립하는 것보다 자릿수 패딩 실수가 없다.
 * ---------------------------------------------
 */

const KST_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** 한국 기준 날짜(`"YYYY-MM-DD"`). 인자를 받으므로 테스트에서 고정할 수 있다. */
export function kstDateString(now: Date = new Date()): string {
  return KST_FORMATTER.format(now);
}
