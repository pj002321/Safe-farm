import type { PlotCard } from "./plotSummary";
import { daysSincePlanting } from "./plotSummary";
import { PYEONG_TO_M2 } from "./registerPlot";

/**
 * ---------------------------------------------
 * [Feature]: 대시보드 텃밭 카드 한 장 (순수 변환)
 *
 * [Description]
 * - `PlotCard`(DB 조회 결과) → `PlotStrip` 이 그대로 찍을 수 있는 글자로 바꾼다.
 *   화면 컴포넌트가 숫자를 매만지지 않게 하려는 것이다.
 * - 생육 단계는 **인자로 받는다.** 단계를 내려면 `features/growth` 가 필요한데
 *   features 끼리는 import 하지 않는다(AGENTS.md) — 계산은 app 계층이 한다.
 * - 모르는 값은 "약 0평", "D+0" 처럼 그럴듯한 거짓말로 채우지 않는다. 사용자가
 *   등록할 때 건너뛴 칸이라 빈 자리로 보이는 편이 맞다.
 * ---------------------------------------------
 */

export interface PlotStripItem {
  id: string;
  nameKo: string;
  cropKo: string;
  /** 파종 후 며칠째. */
  dayLabelKo: string;
  /** 누적 GDD 가 붙기 전에는 알 수 없는 밭이 많다. 모르면 null. */
  stageKo: string | null;
  areaKo: string;
}

export function toPlotStripItem(
  card: PlotCard,
  now: Date,
  stageKo: string | null = null,
): PlotStripItem {
  return {
    id: card.id,
    nameKo: card.nameKo ?? "이름 없는 밭",
    cropKo: toCropKo(card),
    dayLabelKo: toDayLabelKo(card, now),
    stageKo,
    areaKo: toAreaKo(card.areaM2),
  };
}

/**
 * 카드 한 줄에 들어갈 작물 이름.
 *
 * 카드 폭이 15.5rem 이라 이름을 전부 늘어놓으면 잘린다. 두 개부터는 "외 n" 으로
 * 접는다 — 몇 가지를 심었는지는 남고 줄은 안 넘친다.
 */
export function toCropKo(card: Pick<PlotCard, "cultivations">): string {
  const names = card.cultivations
    .map((cultivation) => cultivation.cropNameKo)
    .filter((name): name is string => name !== null);

  if (names.length === 0) return "작물 미정";
  if (names.length === 1) return names[0];
  return `${names[0]} 외 ${names.length - 1}`;
}

/** 파종일을 모르면 날수를 못 낸다. 0 으로 치지 않고 자리를 비운다. */
export function toDayLabelKo(
  card: Pick<PlotCard, "sowingDate">,
  now: Date,
): string {
  const days = daysSincePlanting(card, now);
  return days === null ? "—" : `D+${days}`;
}

/**
 * ㎡ → "약 n평".
 *
 * 등록 때 평으로 받아 ㎡ 로 바꿔 저장하므로 되돌리면 어림수가 나온다. 애초에
 * 눈대중으로 적는 값이라 소수점은 버린다.
 */
export function toAreaKo(areaM2: number | null): string {
  if (areaM2 === null || areaM2 <= 0) return "면적 미상";
  return `약 ${Math.round(areaM2 / PYEONG_TO_M2)}평`;
}
