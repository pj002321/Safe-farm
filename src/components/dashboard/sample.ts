/**
 * ---------------------------------------------
 * [Feature]: 대시보드 퍼블용 고정 데이터
 *
 * [Description]
 * - ⚠️ **이 파일은 지워질 파일이다.** 퍼블 단계에서 화면의 모양과 상태를 눈으로
 *   확인하려고 둔 고정값이고, 조회가 붙으면 통째로 사라진다.
 *   로직을 여기 넣지 말 것 — 계산이 생기면 `features/<도메인>/domain/` 으로 간다.
 * - 값을 일부러 **가지런하지 않게** 뒀다. 우선순위가 섞이고, 근거 문장의 길이가
 *   제각각이고, 완료된 작업이 하나 있다. 예쁜 데이터만 넣으면 줄바꿈·정렬이
 *   깨지는 자리를 퍼블 단계에서 못 본다.
 * - 날짜는 `Date` 가 아니라 문자열이다. 실행 시각에 따라 화면이 달라지면
 *   "어제는 되던 화면"이 생겨 디자인 검토가 불가능해진다.
 * ---------------------------------------------
 */

// Priority/TaskCardData(할 일 카드)와 SAMPLE_TASKS 는 여기 있었다. 조회가 붙어
// `features/dashboard/domain/taskSummary.ts` 로 옮겼다 — 위 주석이 예고한 일이다.
//
// DayForecast/SAMPLE_WEEKEND(주말 예보)도 여기 있었다. 홈이 실제 예보를 부르게
// 되면서 `features/weather/domain/weekSplit.ts` + `ForecastPanel` 로 옮겼다.
// 고정값이 남아 있었다면 화면이 영영 9/19·9/20 을 말했을 것이다.
//
// HazardAlert/SAMPLE_ALERT(기상 특보)도 여기 있었다. 홈이 실제 특보를 부르게
// 되면서 타입은 `features/dashboard/domain/hazardAlert.ts` 로, 조회는
// `HazardBannerSlot` 로 갔다. 고정값이 남아 있었다면 화면이 영영 "상주
// 가을가뭄"을 말했을 것이다.
//
// 이제 SAMPLE_FRESHNESS 하나 남았다(데이터 기준 시각, Step 9). 그것까지 조회가
// 붙으면 이 파일을 지운다.

/** 데이터 기준 시각. 갱신 실패 시 `stale` 이 true 가 되며 문구가 경고로 바뀐다. */
export const SAMPLE_FRESHNESS = {
  baseKo: "2026-09-14 06:00",
  sourceKo: "기상청 API허브 · 상주(137)",
  stale: false,
} as const;
