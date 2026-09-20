/**
 * ---------------------------------------------
 * [Feature]: 풍향(도)을 사람이 읽는 말과 화살표 각도로
 *
 * [Description]
 * - Open-Meteo 는 풍향을 도(0~360)로 준다. 농민에게 "18°" 는 통하지 않는다.
 *   16방위 한글로 바꾼다 — "북북동풍".
 * - 화살표도 같이 그리는데, **글자와 화살표가 가리키는 방향이 반대다.**
 *   그 함정을 여기 한 곳에 가둬 둔다(아래 ⚠).
 *
 * ⚠ **풍향은 "불어오는 쪽" 이다.** 북풍은 북쪽에서 남쪽으로 부는 바람이다.
 *   기상 관례가 그렇고 농민도 그렇게 쓴다. 그런데 화살표를 그 각도로 돌리면
 *   **바람이 북쪽으로 간다고 읽힌다.** 그래서 화살표는 180도를 더해 돌린다.
 *   글자(불어오는 쪽)와 화살표(가는 쪽)가 서로 다른 방향인 것이 맞다.
 *
 * [Usage]
 * ```ts
 * windLabelKo(18)    // "북북동풍"
 * windArrowDeg(18)   // 198  — 화살표를 이만큼 돌린다
 * ```
 * ---------------------------------------------
 */

/**
 * 16방위. 북에서 시작해 시계 방향.
 *
 * 한 칸이 22.5도다 — `Math.round(deg / 22.5)` 로 고르고 16으로 나머지를 취한다.
 * 348.75도 이상은 다시 북이라 나머지 연산이 필요하다.
 */
const DIRECTIONS = [
  "북",
  "북북동",
  "북동",
  "동북동",
  "동",
  "동남동",
  "남동",
  "남남동",
  "남",
  "남남서",
  "남서",
  "서남서",
  "서",
  "서북서",
  "북서",
  "북북서",
] as const;

/** 풍향(도)을 16방위 한글로. 값이 없으면 null — 0 은 정북풍이라 뜻이 다르다. */
export function windDirectionKo(deg: number | null | undefined): string | null {
  if (deg === null || deg === undefined || Number.isNaN(deg)) return null;
  // 음수나 360 이상이 와도 깨지지 않게 감는다
  const normalized = ((deg % 360) + 360) % 360;
  return DIRECTIONS[Math.round(normalized / 22.5) % 16];
}

/** "북북동풍" 처럼 뒤에 '풍' 을 붙인 말. 값이 없으면 null. */
export function windLabelKo(deg: number | null | undefined): string | null {
  const dir = windDirectionKo(deg);
  return dir === null ? null : `${dir}풍`;
}

/**
 * 화살표를 돌릴 각도.
 *
 * ⚠ **180도를 더한다.** 풍향은 불어오는 쪽이라, 그 각도로 그리면 바람이 거꾸로
 *   가는 것처럼 보인다. 아이콘이 위(북)를 가리키는 모양이라는 전제다.
 */
export function windArrowDeg(deg: number | null | undefined): number | null {
  if (deg === null || deg === undefined || Number.isNaN(deg)) return null;
  return (((deg + 180) % 360) + 360) % 360;
}
