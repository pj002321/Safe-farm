/**
 * ---------------------------------------------
 * [Feature]: 할 일이 없을 때 무엇이 없는지 말해 주기 (순수 함수)
 *
 * [Description]
 * - 예전 빈 상태는 늘 "오늘은 특별히 할 일이 없습니다"였다. **그게 거짓일 때가
 *   있다** — 파종일을 안 넣어서 생육을 못 내 판정 자체를 못 한 경우에도 같은
 *   문구가 떴다. 사용자는 확인이 끝난 줄 알고 기다린다.
 * - 그래서 "할 일이 없다"와 "판정을 못 했다"를 가른다. 후자는 **무엇을 하면
 *   되는지**까지 말한다.
 * - ⚠️ **사용자가 고칠 수 있는 것만 행동으로 제안한다.** 관측 자료가 모자라거나
 *   작물 마스터에 기준온도가 비어 있는 것은 우리 쪽 문제다. 그걸 "입력하세요"로
 *   말하면 사용자는 할 수 없는 일을 찾아 헤맨다. 그 경우는 사실만 알린다.
 * - 판정 근거는 화면이 이미 들고 있는 값(밭·재배)뿐이다. 이 함수를 위해 조회를
 *   더 하지 않는다.
 *
 * [Usage]
 * ```ts
 * const reason = emptyTaskReason(plots);
 * // → { kind: "no-sowing-date", plotId, plotKo } 등
 * ```
 * ---------------------------------------------
 */

/** 판정에 필요한 최소 모양. `PlotCard` 가 이걸 만족한다. */
export interface InspectablePlot {
  id: string;
  nameKo: string | null;
  cultivations: readonly {
    status: string;
    sowingDate: string | null;
    cropNameKo: string | null;
  }[];
}

export type EmptyTaskReason =
  /** 밭은 있는데 기르는 작물이 없다. 사용자가 고칠 수 있다. */
  | { kind: "no-cultivation"; plotId: string; plotKo: string }
  /** 작물은 있는데 파종일이 없다. 사용자가 고칠 수 있다. */
  | { kind: "no-sowing-date"; plotId: string; plotKo: string }
  /** 판정이 정상적으로 돌았고 오늘 할 일이 없다. */
  | { kind: "nothing-to-do" };

/** 아직 자라는 중인 재배만 본다. 수확·실패 건은 판정 대상이 아니다. */
function growing(plot: InspectablePlot) {
  return plot.cultivations.filter((c) => c.status === "GROWING");
}

function nameOf(plot: InspectablePlot): string {
  return plot.nameKo?.trim() || "이름 없는 밭";
}

/**
 * 할 일이 하나도 없을 때 화면이 뭐라고 말할지 정한다.
 *
 * 여러 밭이 각기 다른 이유로 막혀 있을 수 있다. 그때는 **하나만 말한다** —
 * 목록을 늘어놓으면 무엇부터 해야 할지 오히려 흐려진다. 고치기 쉬운 순서로
 * 고른다: 작물 등록 → 파종일 입력.
 */
export function emptyTaskReason(
  plots: readonly InspectablePlot[],
): EmptyTaskReason {
  // 밭이 없으면 여기까지 오지 않는다(홈이 온보딩으로 보낸다). 방어적으로 둔다.
  if (plots.length === 0) return { kind: "nothing-to-do" };

  const withoutCultivation = plots.find((plot) => growing(plot).length === 0);
  if (withoutCultivation) {
    return {
      kind: "no-cultivation",
      plotId: withoutCultivation.id,
      plotKo: nameOf(withoutCultivation),
    };
  }

  const withoutSowingDate = plots.find((plot) =>
    growing(plot).some((c) => c.sowingDate === null),
  );
  if (withoutSowingDate) {
    return {
      kind: "no-sowing-date",
      plotId: withoutSowingDate.id,
      plotKo: nameOf(withoutSowingDate),
    };
  }

  // 여기까지 왔으면 화면이 아는 범위에서는 빠진 게 없다. 그래도 카드가 없다면
  // 관측 자료·작물 마스터 쪽이고, 그건 사용자가 손댈 수 없다 —
  // 화면은 "할 일이 없다"로만 말하고 행동을 요구하지 않는다.
  return { kind: "nothing-to-do" };
}
