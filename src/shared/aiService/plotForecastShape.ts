import type { PlotForecast } from "./client";

/**
 * ---------------------------------------------
 * [Feature]: 밭 예보 응답을 선언한 타입과 실제로 같게 만든다
 *
 * [Description]
 * - `call()` 은 응답을 `as T` 로 **맹목적으로 캐스트**한다. 그래서 타입이 배열이라
 *   말해도 런타임에는 `undefined` 가 올 수 있고, 타입은 아무것도 막아 주지 않는다.
 * - ⚠️ **두 서비스가 따로 배포된다.** Next 가 먼저 뜨거나 ai-service 배포가
 *   실패하면, 새 화면이 옛 응답(`{days:[...]}` 뿐)을 받는다. 그때 `hours.length`
 *   한 줄이 async 서버 컴포넌트 안에서 던져서 **밭별 Suspense 로 격리한 설계가
 *   무의미해지고 `/weather` 전체가 오류 화면이 된다**(실측으로 재현했다).
 *   게다가 그 응답은 1시간 캐시에 박혀서, ai-service 가 따라잡은 뒤에도 최대
 *   한 시간 동안 계속 깨진다.
 * - 그래서 **경계에서 한 번** 모양을 맞춘다. 컴포넌트마다 옵셔널 체이닝을 더하는
 *   건 다음에 새 컴포넌트를 쓰는 사람이 또 빠뜨린다 — 모든 호출자가 지나는
 *   길목은 여기 하나다.
 * - 값을 지어내지 않는다. 없으면 "없음"(null / 빈 배열)이지 0 이 아니다.
 *
 * [Usage]
 * ```ts
 * const data = normalizePlotForecast(await response.json());
 * ```
 * ---------------------------------------------
 */

/** 배열이 아니면 빈 배열. 화면이 `.map`·`.length` 를 바로 부를 수 있어야 한다. */
function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** 객체가 아니면 null. `undefined` 를 남기면 `{x} &&` 가드가 통과해 버린다. */
function asObject<T>(value: unknown): T | null {
  return value !== null && typeof value === "object" ? (value as T) : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function normalizePlotForecast(raw: unknown): PlotForecast {
  const source = (asObject<Record<string, unknown>>(raw) ?? {}) as Record<
    string,
    unknown
  >;

  const alert = asObject<PlotForecast["alert"]>(source.alert);

  return {
    current: asObject<NonNullable<PlotForecast["current"]>>(source.current),
    hours: asArray<PlotForecast["hours"][number]>(source.hours),
    days: asArray<PlotForecast["days"][number]>(source.days),
    rainfall3d: asNumber(source.rainfall3d),
    rainfall5d: asNumber(source.rainfall5d),
    rainfall7d: asNumber(source.rainfall7d),
    // 빈 배열과 null 은 다르다. null 은 "재배 중인 작물이 없다"는 뜻이고,
    // 화면은 그때 막대 칸 자체를 안 그린다.
    growthSeries: Array.isArray(source.growthSeries)
      ? (source.growthSeries as NonNullable<PlotForecast["growthSeries"]>)
      : null,
    cropImpact: asObject<NonNullable<PlotForecast["cropImpact"]>>(
      source.cropImpact,
    ),
    // warnings 가 배열이 아니면 특보 자체를 없는 것으로 친다 — 경보 화면에서
    // 반쪽짜리 객체를 그리느니 안 그리는 쪽이 안전하다.
    alert:
      alert && Array.isArray((alert as { warnings?: unknown }).warnings)
        ? alert
        : null,
  };
}
