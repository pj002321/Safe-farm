/**
 * ---------------------------------------------
 * [Feature]: 영농일지가 고르게 하는 값 (순수)
 *
 * [Description]
 * - 농민이 보조금·인증 서류로 영농일지를 낸다. 농사로 폼은 활동유형과 날씨를
 *   손으로 받는데, 우리는 **고르는 것만 고르게 하고 숫자는 우리가 채운다.**
 * - **목록을 여기 한 곳에 둔다.** 폼(`ObservationForm`)과 저장(`actions.ts`)이
 *   같은 목록을 봐야 한다. 두 벌로 두면 폼에만 항목을 추가했을 때 저장이 조용히
 *   버린다.
 * - **DB 에 CHECK 를 걸지 않았다**(`20260920090000_...farm_diary.sql`). 값이 하나
 *   늘 때마다 마이그레이션을 내야 하고, 이 칸들은 사람이 읽는 CSV 로만 나가기
 *   때문이다. 대신 저장 전에 이 목록으로 한 번 거른다.
 * - **기본값이 없다.** 라디오에 기본을 두면 안 펼친 사람의 일지가 전부 '물주기'
 *   가 되고, 그게 그대로 서류에 실린다.
 *
 * [Usage]
 * ```ts
 * pickWorkKind("방제");   // "방제"
 * pickWorkKind("아무거나"); // null — 폼이 깨졌거나 남이 보낸 값
 * ```
 * ---------------------------------------------
 */

/** 농사로의 "활동유형". 순서가 폼의 차례다. */
export const WORK_KINDS = [
  "물주기",
  "웃거름",
  "방제",
  "김매기",
  "수확",
  "기타",
] as const;
export type WorkKind = (typeof WORK_KINDS)[number];

/**
 * 사용자가 고르는 하늘.
 *
 * 우리가 못 채우는 유일한 날씨 칸이다 — `pipeline/open_meteo_client.py` 의 daily
 * 요청에 `weather_code` 가 없어 맑음과 흐림을 가를 수 없다. 거기에 변수를 더하면
 * 예보 카드·리포트가 같이 쓰는 호출이 무거워지므로, 폼에서 고르는 쪽이 싸다.
 */
export const SKY_KINDS = ["맑음", "흐림", "비", "눈"] as const;
export type SkyKind = (typeof SKY_KINDS)[number];

/** 목록에 있는 값만 통과. 없으면 null — 빈칸으로 저장된다. */
export function pickWorkKind(raw: unknown): WorkKind | null {
  return typeof raw === "string" &&
    (WORK_KINDS as readonly string[]).includes(raw)
    ? (raw as WorkKind)
    : null;
}

/** 목록에 있는 값만 통과. 없으면 null — 빈칸으로 저장된다. */
export function pickSkyKind(raw: unknown): SkyKind | null {
  return typeof raw === "string" &&
    (SKY_KINDS as readonly string[]).includes(raw)
    ? (raw as SkyKind)
    : null;
}
