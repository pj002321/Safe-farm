import type { DayFlag } from "@/features/weather/domain/forecastAlerts";

/**
 * ---------------------------------------------
 * [Feature]: 임계를 넘은 날의 색 — 한 곳에서만 정한다
 *
 * [Description]
 * - 같은 판정(`dayFlag`)을 7일 표와 주간 밴드가 함께 그린다. 색을 각자 들고 있으면
 *   서랍을 열었을 때 밴드와 표가 다른 말을 하게 된다.
 * - 리터럴 레코드인 이유: Tailwind 는 클래스를 **정적으로** 읽는다. `text-${x}` 로
 *   조립하면 생성되지 않고 조용히 사라진다(`plotIdentity.ts` 와 같은 방침).
 * ---------------------------------------------
 */

/** 글자 색(7일 표의 기온 칸). */
export const FLAG_TEXT: Record<NonNullable<DayFlag>, string> = {
  frost: "text-info",
  cold: "text-info",
  hot: "text-caution",
};

/** 막대 색(주간 밴드). 같은 판정이므로 같은 토큰 계열을 쓴다. */
export const FLAG_BAR: Record<NonNullable<DayFlag>, string> = {
  frost: "bg-info",
  cold: "bg-info",
  hot: "bg-caution",
};
