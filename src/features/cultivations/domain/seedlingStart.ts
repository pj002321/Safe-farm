/**
 * ---------------------------------------------
 * [Feature]: 모종으로 심었을 때 GDD 를 시작할 단계 (순수 함수)
 *
 * [Description]
 * - 씨앗은 0 에서 쌓고, 모종은 이미 자란 만큼 건너뛴다. 얼마를 건너뛰나 —
 *   `crop_stages` 에서 "아주심기·정식·이식·모내기" 단계를 찾아 그 `stage_order` 를 준다.
 *   ai-service `plot_growth._start_gdd` 가 그 단계의 gdd_from 부터 쌓는다.
 * - **한살이의 40% 넘게 건너뛰는 모종은 없다.** 넘으면 표가 틀린 것으로 보고 null 이다 —
 *   양파는 아주심기가 89.3%(969/1085) 자리에 적혀 있어 단계 순서가 뒤집혔고, 아스파라거스는
 *   57.8% 다(다년생이라 첫해 모종 얘기가 아니다). 그런 표에 기대면 심은 날 수확기가 뜬다.
 * - 문턱이 절대값(500)이 아니라 비율인 까닭: 작물 한살이가 461~3151 로 7배 차이 난다.
 *   같은 500 이 두릅에겐 거의 전부고 파슬리에겐 6분의 1이다 (2026-09-18 실측 · 교안 §2-1a).
 * - 없으면 null — 씨앗과 같게 0 에서 센다. 틀린 보정보다 없는 보정이 낫다.
 * ---------------------------------------------
 */

const TRANSPLANT = /아주심기|정식|이식|모내기|옮겨/;

/** 한살이의 몇 %까지를 '육묘' 로 인정하나. 실측에서 35.8%(셀러리)와 57.8%(아스파라거스) 사이가 비어 있다 */
const MAX_SKIP_RATIO = 0.4;

/**
 * `crop_stages` 날 행 그대로다 — DB 이름(snake_case)을 안 바꾼다.
 *
 * ⚠ 같은 폴더의 `growthGauge.StageRow` 와 **다른 것이다.** 저쪽은 화면이 쓰는
 *   camelCase 로 옮긴 것이고, 이쪽은 insert 직전에 날 행을 그대로 받는다.
 *   이름이 겹치면 import 를 잘못 집어도 눈치채기 어려워 `Seedling` 을 붙였다.
 */
export interface SeedlingStageRow {
  stage_order: number;
  stage_name: string;
  gdd_from: number;
  gdd_to: number;
}

export function seedlingStartStage(stages: readonly SeedlingStageRow[]): number | null {
  const sorted = [...stages].sort((a, b) => a.stage_order - b.stage_order);
  const hit = sorted.find((s) => TRANSPLANT.test(s.stage_name));
  // 마지막 단계의 gdd_to 가 곧 그 품종의 gdd_target 이다(crop-data verify 가 맞춰 둔다).
  // crop_variants 를 또 조회하지 않는 까닭 — 같은 질의로 이미 손에 있다
  const total = sorted.at(-1)?.gdd_to ?? 0;
  if (!hit || total <= 0) return null;
  return hit.gdd_from / total < MAX_SKIP_RATIO ? hit.stage_order : null;
}
