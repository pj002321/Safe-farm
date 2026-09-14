/**
 * ---------------------------------------------
 * [Feature]: SVG 차트 좌표 계산
 *
 * [Description]
 * - 차트 라이브러리를 쓰지 않고 SVG 를 직접 그린다. 필요한 건 좌표 변환뿐이라
 *   수백 KB짜리 의존성을 들일 이유가 없다. 대신 계산만 여기로 떼어 테스트한다.
 * - NaN 방지가 이 파일의 존재 이유다. 좌표 한 개라도 NaN 이면 `<polyline>` 이
 *   통째로 사라지는데, 화면에는 아무 오류도 안 뜬다. 점이 하나뿐이거나
 *   도메인 폭이 0인 경우를 전부 막아두고 테스트로 고정한다.
 *
 * [Usage]
 * ```ts
 * const box = { width: 440, height: 180, padding: { top: 12, right: 12, bottom: 26, left: 36 } };
 * const scale = createScale(["04-03", "09-12"], { lo: 0.2, hi: 0.85 }, box);
 * <polyline points={toPolylinePoints(points, scale)} />
 * ```
 * ---------------------------------------------
 */

/** 차트 바깥 상자와 축 라벨이 들어갈 여백. */
export interface ChartBox {
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
}

/** "MM-DD" 와 지수값을 SVG 좌표로 옮기는 한 쌍. */
export interface Scale {
  x(date: string): number;
  y(value: number): number;
}

const MONTH_DAY = /^(\d{2})-(\d{2})$/;

/**
 * "MM-DD" 를 연속 숫자로 바꾼다. 한 달을 31일로 고정해도 되는 이유:
 * 이 값은 가로 위치를 정하는 데만 쓰이고, 30일 달이 하루 넓게 그려지는 차이는
 * 440px 폭에서 1px 미만이다. 실제 날짜 계산이 필요해지면 Date 로 바꿀 것.
 *
 * 형식이 어긋나면 던진다 — 조용히 NaN 을 흘리면 선이 사라진 원인을 찾을 수 없다.
 */
export function dateToNumber(monthDay: string): number {
  const matched = MONTH_DAY.exec(monthDay);
  if (!matched) {
    throw new TypeError(`"MM-DD" 형식이 아닙니다: ${monthDay}`);
  }
  return Number(matched[1]) * 31 + Number(matched[2]);
}

/**
 * 날짜 목록의 최소~최대를 가로에, `domain.lo~hi` 를 세로에 대응시킨다.
 * 폭이 0이면(점 하나, 또는 lo === hi) 그리는 영역의 한가운데로 보낸다.
 */
export function createScale(
  dates: readonly string[],
  domain: { lo: number; hi: number },
  box: ChartBox,
): Scale {
  const { padding } = box;
  const innerWidth = Math.max(0, box.width - padding.left - padding.right);
  const innerHeight = Math.max(0, box.height - padding.top - padding.bottom);

  const numbers = dates.map(dateToNumber);
  const minDate = numbers.length > 0 ? Math.min(...numbers) : 0;
  const maxDate = numbers.length > 0 ? Math.max(...numbers) : 0;
  const dateSpan = maxDate - minDate;
  const valueSpan = domain.hi - domain.lo;

  return {
    x(date) {
      if (dateSpan <= 0) return padding.left + innerWidth / 2;
      const ratio = (dateToNumber(date) - minDate) / dateSpan;
      return padding.left + ratio * innerWidth;
    },
    y(value) {
      if (valueSpan <= 0) return padding.top + innerHeight / 2;
      const ratio = (domain.hi - value) / valueSpan;
      return padding.top + ratio * innerHeight;
    },
  };
}

/**
 * `<polyline points="...">` 문자열. 소수 한 자리로 줄여 마크업을 가볍게 한다.
 * 좌표가 유한하지 않은 점은 건너뛴다 — 결측 한 점 때문에 선 전체가
 * 사라지는 편보다, 그 구간만 이어 그리는 편이 정직하다.
 */
export function toPolylinePoints(
  points: readonly { date: string; value: number }[],
  scale: Scale,
): string {
  const parts: string[] = [];
  for (const point of points) {
    const x = scale.x(point.date);
    const y = scale.y(point.value);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    parts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return parts.join(" ");
}

/**
 * y축 눈금값. `lo` 부터 `step` 간격으로 `hi` 이하까지.
 * 0.1 씩 더하면 0.30000000000000004 같은 값이 그대로 라벨에 찍히므로,
 * step 의 소수 자릿수에 맞춰 매번 반올림한다. -0 도 0 으로 되돌린다.
 */
export function axisTicks(lo: number, hi: number, step: number): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [];
  if (!(step > 0) || hi < lo) return [];

  const decimals = (String(step).split(".")[1] ?? "").length;
  // 눈금이 수천 개 나오는 step 이 들어오면 렌더가 멈춘다. 상한을 둔다.
  const count = Math.min(1000, Math.floor((hi - lo) / step + 1e-9));
  const ticks: number[] = [];
  for (let index = 0; index <= count; index += 1) {
    const rounded = Number((lo + index * step).toFixed(decimals));
    ticks.push(rounded === 0 ? 0 : rounded);
  }
  return ticks;
}
