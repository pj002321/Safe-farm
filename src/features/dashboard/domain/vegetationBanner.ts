import {
  isRipeningStage,
  NDVI_GROWING,
  summarizeObservations,
} from "@/shared/growth/vegetationText";

/**
 * ---------------------------------------------
 * [Feature]: 홈 생육 배너에 무엇을 몇 줄 보일지 (순수 판단)
 *
 * [Description]
 * - **한 줄만 보인다.** 두 줄부터는 그 아래 할 일 카드가 화면 밖으로 밀린다.
 * - 그 한 줄은 **모르면 손해 보는 것**에 쓴다.
 *
 *       급한 것이 있으면   좌표가 밭이 아니거나 잎이 성긴 밭 — 모르고 지나가면
 *                        그 밭의 값이 통째로 틀린 채로 남는다
 *       없으면            부르는 쪽이 이 달에 심는 작물을 대신 보인다
 *
 * - 급한 것이 여럿이면 **날짜로 돌아가며** 하나다. 날마다 달라 화면이 굳지
 *   않고, 하루 안에서는 안 바뀌어 다시 찾을 수 있다.
 *
 * - ⚠ **`Math.random()` 을 쓰지 않는다.** 새로고침마다 바뀌면 "아까 그 글
 *   뭐였지" 하고 못 찾는다. 그리고 랜덤은 테스트로 못 박는다 — 날짜로 고르면
 *   "9월 19일엔 이게 뜬다" 를 박을 수 있다.
 *
 * - ⚠ **'물기가 줄었다' 는 급한 것이 아니다.** 익어 가는 밭은 잎이 마르는 게
 *   정상이라, 급한 칸에 넣으면 멀쩡한 밭 둘이 늘 걱정거리로 뜬다(실측: 밭 5개
 *   중 2개가 그랬다). 급한 것은 **잎이 없거나 좌표가 틀린 것**뿐이다.
 * ---------------------------------------------
 */

export interface VegetationItem {
  plotNameKo: string;
  /** 화면에 나갈 몸말. "잎이 빽빽하게 덮였어요. …" */
  bodyKo: string;
  /** 마지막 관측일 "MM-DD". 없으면 null */
  observedOnKo: string | null;
  /**
   * 꼭 봐야 하는가. 참이면 날짜와 상관없이 늘 보인다.
   *
   * ⚠ 좌표가 밭이 아닌 것(NDVI 음수)과 잎이 성긴 것(0.4 미만)만이다.
   *   물기가 준 것은 익는 중이면 정상이라 여기 안 넣는다.
   */
  urgent: boolean;
}

export interface PlotObservation {
  plotNameKo: string | null;
  points: ReadonlyArray<{ date: string; ndvi: number; ndmi: number }>;
  /** 이 밭의 현재 생육단계. 익어 가는 중이면 물기가 주는 것이 정상이다 */
  stageNameKo?: string | null;
}

/**
 * 밭 하나를 배너 한 줄로. 할 말이 없으면 `null`.
 *
 * ⚠ 밭 이름이 비면 줄을 만들지 않는다. "이름 없는 밭이 …" 는 어느 밭인지
 *   알려 주지 못해 사용자가 할 수 있는 일이 없다.
 */
export function toVegetationItem(plot: PlotObservation): VegetationItem | null {
  const name = plot.plotNameKo?.trim();
  if (!name || plot.points.length === 0) return null;

  const last = plot.points[plot.points.length - 1];
  if (!last) return null;

  const bodyKo = summarizeObservations(plot.points, {
    isRipening: isRipeningStage(plot.stageNameKo),
  });
  if (!bodyKo) return null;

  return {
    plotNameKo: name,
    bodyKo,
    observedOnKo: last.date.slice(5),
    // 잎이 성기면(0.4 미만) 급하다. 음수(좌표가 밭이 아님)도 여기 든다 —
    // 0 < 0.4 이라 따로 적을 필요가 없다
    urgent: last.ndvi < NDVI_GROWING,
  };
}

/**
 * 오늘 배너에 보일 **급한 줄 하나**. 급한 것이 없으면 `null` —
 * 그때는 부르는 쪽이 이 달에 심는 작물을 대신 보인다.
 *
 * ⚠ **급하지 않은 줄은 안 보인다.** "잎이 빽빽해요" 는 좋은 소식이라 자리를
 *   차지할 값어치가 없다. 배너 한 줄은 **모르면 손해 보는 것**에 쓴다.
 *
 * ⚠ 급한 것이 여럿이면 **날짜로 돌아가며** 하나다. 한 줄뿐이라 늘 같은 밭만
 *   보이면 나머지는 영영 안 보인다.
 *
 * `today` 를 받는 이유는 테스트 때문만이 아니다. 서버 렌더라 요청 시각을 그대로
 * 쓰면 자정 언저리에 요청마다 다른 줄이 나온다 — 부르는 쪽이 한 번 정해 넘긴다.
 */
export function pickBannerItem(
  items: readonly VegetationItem[],
  today: Date,
): VegetationItem | null {
  const 급한것 = items.filter((x) => x.urgent);
  if (급한것.length === 0) return null;
  return 급한것[dayIndex(today) % 급한것.length] ?? null;
}

/**
 * 1970-01-01 부터의 날수. 달을 넘을 때 번호가 1로 돌아가지 않게 하려는 것이다 —
 * `getDate()` 를 쓰면 31일 다음이 1일이라 같은 밭이 이어서 두 번 뜬다.
 */
function dayIndex(at: Date): number {
  return Math.floor(at.getTime() / 86_400_000);
}

/** 화면에 나갈 한 줄. "아빠 논1번 · 잎이 빽빽해요. · 09-18 위성 관측" */
export function toBannerLine(item: VegetationItem): string {
  const 꼬리 = item.observedOnKo ? ` · ${item.observedOnKo} 위성 관측` : "";
  // ⚠ 밭 이름 뒤에 조사를 붙이지 않는다. 받침에 따라 '은/는' 이 갈리는데
  //   그 규칙이 ai-service 에만 있다(app/domain/korean.py). 두 벌로 두지 않는다.
  return `${item.plotNameKo} · ${item.bodyKo}${꼬리}`;
}

/** 배너에 이름을 늘어놓을 최대 작물 수. 더 적으면 소개가 안 되고, 더 많으면 줄이 넘친다. */
export const MAX_CROPS = 4;

/**
 * 급한 것이 없는 날 보일 한 줄. 심을 것이 없으면 `null`.
 *
 *     "9월에 흔히 심는 것 — 시금치 · 양파 · 고사리. 지역에 따라 열흘쯤 차이가 납니다."
 *
 * ⚠ **"지금 심으세요" 가 아니다.** 파종 시기는 남부·중부가 열흘 넘게 갈리는데
 *   우리 마스터에는 **지역 구분이 없다**(2026-09-19 실측 — 같은 작물 조·중·만생
 *   3품종이 전부 같은 파종창 하나를 쓴다). 지어낸 정확도를 붙이느니 한 발
 *   물러서서 "흔히 심는 것" 이라 말하고, 지역 차를 함께 적는다.
 *
 * ⚠ 이름을 고르는 규칙을 두지 않는다. 부르는 쪽이 이미 "오늘이 파종창 안인가"
 *   로 걸러 넘기므로, 여기서는 **순서만 지켜 자른다.**
 */
export function toSowingLine(
  cropNamesKo: readonly string[],
  month: number,
): string | null {
  const 이름 = cropNamesKo.filter((x) => x.trim()).slice(0, MAX_CROPS);
  if (이름.length === 0) return null;
  return (
    `${month}월에 흔히 심는 것 — ${이름.join(" · ")}. ` +
    "지역에 따라 열흘쯤 차이가 납니다."
  );
}
