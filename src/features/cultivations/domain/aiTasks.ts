import type { TaskAdvice, TaskTone } from "@/shared/growth/taskAdvice";

/**
 * ---------------------------------------------
 * [Feature]: ai-service 가 낸 작업카드를 화면 모양으로 (순수)
 *
 * [Description]
 * - 재배 상세의 `이번 주 할 일` 은 이제 홈과 **같은 판정**을 쓴다
 *   (ai-service `domain/task_rules.py`). 화면 쪽 규칙이 따로 판정하던 때는
 *   임계값이 갈려서 반대되는 조언이 나갔다 — 추수 3주 전 물을 뺀 논에 홈은
 *   조용한데 상세가 "충분히 주기" 를 냈다.
 * - **id 를 제목으로 둔다.** 저장되지 않는 계산값이라 서버가 주는 id 가 없고,
 *   그날 `했음` 을 거르는 `domain/doneTasks.ts` 도 **제목으로** 맞춘다. 열쇠를
 *   둘로 두면 한쪽만 바뀌었을 때 누른 카드가 되살아난다.
 * - **급함/보통/여유를 홈과 같게 색으로 옮긴다.** 같은 판정에서 나온 카드가
 *   두 화면에서 다른 색이면 사용자가 다른 일로 읽는다
 *   (`components/dashboard/TaskBoard.tsx` 의 `PRIORITY`).
 * - 모르는 등급은 **가장 약한 쪽**으로 떨어뜨린다. 서버가 등급을 더했을 때
 *   화면이 조용히 "급함" 으로 올리는 것보다 낫다.
 *
 * ⚠️ **두 서비스가 따로 배포된다.** 옛 응답·빈 칸이 올 수 있어 여기서 한 번
 *    좁힌다 — 컴포넌트마다 방어하지 않는다(`normalizePlotForecast` 와 같은 결).
 * ---------------------------------------------
 */

/**
 * 할 일이 0장인 **까닭**. 화면이 그 셋을 다른 말로 그린다.
 *
 * ★ 2026-09-20 — 셋을 한 문장("생육 단계를 판정하지 못해…")으로 뭉개고 있었다.
 *   상추처럼 단계가 멀쩡한데 조건이 없어 0장인 밭에도 그 말이 나갔다. 거짓말이다.
 *
 * ⚠ ai-service 가 이 구분을 지키려고 애쓴 자리다 —
 *   *"0건이 정상인 유일한 경로다. 위의 건너뜀들과 섞이면 '데이터가 없다' 와
 *   '할 일이 없다' 를 구분할 수 없다"*(`service/plot_tasks.py`).
 *   화면이 도로 뭉개면 그 애쓴 것이 사라진다.
 */
export type TaskReason =
  /** 판정이 돌았다. 0장이면 **오늘 할 일이 없다는 뜻**이다. */
  | "ok"
  /** 단계표가 없거나 기준온도·목표GDD 가 비어 생육단계를 못 세웠다. */
  | "no-stage"
  /** ai-service 를 못 불렀다. 다시 하면 될 수 있다. */
  | "failed";

/** 이 함수가 보는 만큼만. `AiTaskCard` 보다 좁게 잡아 도메인을 client 에 안 묶는다. */
export interface AiTaskLike {
  title?: unknown;
  reason?: unknown;
  priority?: unknown;
}

const TONE: Record<string, TaskTone> = {
  high: "unsuitable",
  mid: "caution",
  low: "info",
};

function text(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

/**
 * 카드 목록을 화면이 쓰는 모양으로. **제목이 없는 것은 버린다.**
 *
 * 제목이 곧 열쇠라 빈 제목은 `했음` 과 맞출 수가 없다. 같은 제목이 두 번 오면
 * 한 번만 그린다 — 화면에 같은 줄이 둘 뜨는 것보다 하나가 낫다.
 */
export function toTaskAdvices(
  cards: readonly AiTaskLike[],
): readonly TaskAdvice[] {
  const seen = new Set<string>();
  const advices: TaskAdvice[] = [];

  for (const card of cards) {
    const titleKo = text(card.title);
    if (titleKo.length === 0 || seen.has(titleKo)) continue;
    seen.add(titleKo);

    advices.push({
      id: titleKo,
      titleKo,
      whyKo: text(card.reason),
      tone: TONE[text(card.priority)] ?? "info",
    });
  }

  return advices;
}
