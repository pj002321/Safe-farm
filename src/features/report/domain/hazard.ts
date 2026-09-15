/**
 * ---------------------------------------------
 * [Feature]: 기상재해 판정 (규칙 기반)
 *
 * [Description]
 * - 임계값을 우리가 정하지 않는다. 농촌진흥청 배추 농작업일정의 재해 대책표를
 *   숫자로 옮긴 것뿐이다. 그래야 화면의 조언이 "우리 생각"이 아니라 "기관 지침"이
 *   되고, 틀렸을 때 어디를 고쳐야 하는지도 분명해진다.
 * - **LLM 이 판정하지 않는다.** 여기서 발동 여부와 처방을 정하고, LLM 은 그 결과를
 *   사람 말로 옮기기만 한다. 판단을 맡기면 입력에 없는 숫자를 지어낸다.
 * - 규칙을 배열로 두고 순서대로 검사한다. 새 재해가 생기면 이 배열에만 추가한다.
 *
 * [Usage]
 * ```ts
 * const fired = evaluateHazards(HAZARD_RULES, {
 *   rain7Mm: 0.1, tempMaxC: 28.8, tempMinC: 15.0, stage: "결구",
 * });
 * fired[0].nameKo;   // "가을가뭄"
 * ```
 * ---------------------------------------------
 */

/** 판정에 넣는 관측 요약. 규칙이 보는 값은 이게 전부다. */
export interface HazardInput {
  /** 최근 7일 강수 합계(mm) */
  rain7Mm: number;
  tempMaxC: number;
  tempMinC: number;
  /** 지금 생육 단계. 단계에 따라 같은 기온도 위험도가 다르다. */
  stageKo: string;
}

export type HazardSeverity = "warning" | "caution";

export interface HazardRule {
  id: string;
  nameKo: string;
  severity: HazardSeverity;
  /** 발동 조건. 순수 함수여야 한다(외부 상태를 보지 말 것). */
  when: (input: HazardInput) => boolean;
  /** 농진청 대책표의 조치. 화면의 "할 일" 문장이 여기서 나온다. */
  actionsKo: readonly string[];
  /** 근거 출처. 화면 각주에 그대로 찍힌다. */
  sourceKo: string;
}

/**
 * 배추 재해 규칙.
 *
 * `rain7Mm < 5` 의 5mm 는 농진청 "가을가뭄" 대책의 관행 기준을 옮긴 값이다.
 * 결구적온 15~16℃ 는 같은 문서의 생육온도표에서 왔고, 언피해 -3~-4℃ 도 마찬가지다.
 * **숫자를 바꾸려면 문서를 먼저 확인할 것.**
 */
export const HAZARD_RULES: readonly HazardRule[] = [
  {
    id: "autumn-drought",
    nameKo: "가을가뭄",
    severity: "warning",
    when: (i) => i.rain7Mm < 5,
    actionsKo: [
      "이동식 스프링클러로 물 주기",
      "짚 덮기로 수분 지키기",
      "살충제 살포 (건조기 해충 대비)",
    ],
    sourceKo: "농촌진흥청 배추 농작업일정 · 기상재해 대책",
  },
  {
    id: "heading-heat",
    nameKo: "결구기 고온",
    severity: "caution",
    // 결구적온이 15~16℃ 다. 낮 기온이 25℃ 를 넘으면 속이 헐거워진다.
    when: (i) => i.tempMaxC > 25 && i.stageKo === "결구",
    actionsKo: ["해질 무렵 물 주기로 지온 낮추기", "차광망 검토"],
    sourceKo: "농촌진흥청 배추 생육온도 · 결구적온 15~16℃",
  },
  {
    id: "freeze",
    nameKo: "한파 언피해",
    severity: "warning",
    when: (i) => i.tempMinC <= -3,
    actionsKo: ["부직포 덮기", "수확 앞당기기 검토"],
    sourceKo: "농촌진흥청 배추 생육온도 · 언피해 -3~-4℃",
  },
];

export interface FiredHazard {
  id: string;
  nameKo: string;
  severity: HazardSeverity;
  actionsKo: readonly string[];
  sourceKo: string;
  /** 발동 근거를 사람이 읽을 수 있게. "7일 강수 0.1mm < 5mm" 같은 문장. */
  becauseKo: string;
}

/** 발동한 규칙만 순서대로 돌려준다. 아무것도 안 걸리면 빈 배열. */
export function evaluateHazards(
  rules: readonly HazardRule[],
  input: HazardInput,
): FiredHazard[] {
  return rules
    .filter((rule) => rule.when(input))
    .map((rule) => ({
      id: rule.id,
      nameKo: rule.nameKo,
      severity: rule.severity,
      actionsKo: rule.actionsKo,
      sourceKo: rule.sourceKo,
      becauseKo: explain(rule.id, input),
    }));
}

/** 발동 근거 한 줄. 규칙마다 보는 값이 달라 여기서 갈라 쓴다. */
function explain(ruleId: string, input: HazardInput): string {
  switch (ruleId) {
    case "autumn-drought":
      return `이레 강수 ${input.rain7Mm.toFixed(1)}mm — 기준 5mm 미만`;
    case "heading-heat":
      return `낮 기온 ${input.tempMaxC}℃ — 결구적온 15~16℃보다 높음`;
    case "freeze":
      return `아침 기온 ${input.tempMinC}℃ — 언피해 기준 -3℃ 이하`;
    default:
      return "";
  }
}
