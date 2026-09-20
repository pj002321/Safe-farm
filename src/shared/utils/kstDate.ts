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

const KST_STAMP_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  // ⚠️ `hour12: false` 가 아니다. 그 옵션은 로케일에 따라 h24 로 풀려 **자정이
  //    "24:10" 으로 나온다**(같은 시각이 어떤 서버에서는 00:10, 어떤 서버에서는
  //    24:10). `hourCycle` 은 0~23 을 못 박는다. 둘을 같이 주면 `hour12` 가
  //    이기므로 그쪽을 지웠다.
  hourCycle: "h23",
});

/**
 * 한국 기준 날짜와 시각(`"2026-09-19 20:41"`). 못 읽으면 null.
 *
 * DB 의 `timestamptz` 는 UTC 로 온다. 한국 시간 오전 9시 이전이면 날짜가 하루
 * 전으로 보이므로 여기서 한 번에 바꾼다 — 화면마다 `new Date()` 를 주무르면
 * 어떤 자리는 UTC 로 남는다.
 */
export function kstStampString(iso: string | null): string | null {
  if (iso === null) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  // en-CA 는 "2026-09-19, 20:41" 로 준다. 쉼표만 떼면 읽기 좋은 꼴이 된다.
  return KST_STAMP_FORMATTER.format(at).replace(",", "");
}
