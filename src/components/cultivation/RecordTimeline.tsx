import { DiaryDetail } from "@/components/cultivation/DiaryDetail";
import { SubmitButton } from "@/components/shared/SubmitButton";
import type { TimelineEntry } from "@/features/cultivations/domain/timeline";

/**
 * ---------------------------------------------
 * [Feature]: 재배 기록 타임라인
 *
 * [Description]
 * - 파종·수확·중단(`cultivations` 컬럼)과 메모·작업·단계 보정·예측
 *   (`cultivation_events`)을 **합쳐서** 최신순으로 세운다. 합치는 일은
 *   `domain/timeline.ts` 가 하고 여기는 그리기만 한다.
 * - 재배에서 온 줄(파종·수확·중단)에는 지우기 버튼을 달지 않는다. 그건 기록이
 *   아니라 상태라서, 지우려면 재배 자체를 고쳐야 한다.
 * - 펼치면 **그 줄에 박힌 값이 칸마다 이름을 달고** 나온다(`DiaryDetail`).
 *   저장할 때 박아 둔 값을 그대로 읽는다 — 여기서 다시 조회하면 관측 정정 때
 *   과거 일지가 바뀐다. **빈 칸도 이름은 띄운다** — 무엇이 담기는 일지인지
 *   보이려는 것이다.
 * - **줄을 접어 둔다.** 날씨·조언이 붙으면서 한 줄이 네댓 줄이 됐다. 목록은
 *   "언제 무엇을 했나" 를 훑는 자리라, 자세한 것은 눌렀을 때만 편다.
 *   ⚠ `<details>` 로 한다 — 상태를 안 들고 있어도 되니 **JS 가 0줄**이고, 이
 *     화면이 Server Component 로 남는다. 생육 단계의 "지난 단계" 와 같은 방식이다.
 *   ⚠ **펼 것이 없는 줄은 접지 않는다.** 파종·수확처럼 제목이 전부인 줄에
 *     삼각형만 달아 두면 눌러도 아무 일이 없다.
 * ---------------------------------------------
 */

export interface RecordTimelineProps {
  entries: readonly TimelineEntry[];
  /** 단계 번호 → 이름. `STAGE_SET` 줄에 이름을 붙인다. */
  stageNames: Record<number, string>;
  plotId: string;
  cultivationId: string;
  onRemove: (formData: FormData) => Promise<void>;
}

/** 재배 상태에서 온 줄. 지우기 버튼을 달지 않는다. */
const FROM_CULTIVATION = new Set(["SOWN", "HARVESTED", "FAILED"]);

/**
 * 한 줄의 제목. 가운뎃점으로 잇는다.
 *
 * ⚠ **담은 줄(`TASK_DONE`)은 카드 이름을 싣는다.** `작업 완료 · 줄기비대기` 로만
 *   두면 펼치기 전에는 **무슨 일을 했는지 알 수 없다** — 그 줄의 `body` 가 곧
 *   카드 이름이다.
 *
 *   대신 그 줄에서는 `한 일` 을 뺀다. 활동유형은 그 저장의 값이라 같은 날 담은
 *   카드마다 같은 말이 붙어 목록이 시끄러워진다. 펼치면 그대로 보인다.
 */
function titleOf(entry: TimelineEntry, stageKo: string | null): string {
  const parts =
    entry.kind === "TASK_DONE"
      ? [entry.titleKo, entry.bodyKo, stageKo]
      : [entry.titleKo, entry.workKindKo, stageKo];
  return parts.filter(Boolean).join(" · ");
}

/**
 * 접었다 펼 만한 속이 있나. 없으면 제목만 그린다.
 *
 * `createdAtIso` 하나로 가른다 — `cultivation_events` 행이면 늘 있고, 재배 컬럼에서
 * 온 줄(파종·수확·중단)에는 없다. 그 셋은 담을 칸 자체가 없어서 펼쳐 봐야 전부
 * 빈칸이다.
 */
function hasDetail(entry: TimelineEntry): boolean {
  return entry.createdAtIso !== null;
}

export function RecordTimeline({
  entries,
  stageNames,
  plotId,
  cultivationId,
  onRemove,
}: RecordTimelineProps) {
  if (entries.length === 0) {
    return <p className="text-fg-muted text-sm">아직 기록이 없습니다.</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {entries.map((entry) => {
        const stageKo =
          entry.stageOrder === null ? null : stageNames[entry.stageOrder];

        return (
          <li
            key={entry.id}
            className="flex gap-3 rounded-lg border border-border bg-surface px-4 py-3"
          >
            <time className="w-20 shrink-0 text-fg-muted text-xs">
              {entry.occurredOn.slice(5)}
            </time>

            <div className="min-w-0 flex-1">
              {hasDetail(entry) ? (
                <details>
                  <summary className="cursor-pointer font-medium text-fg text-sm">
                    {titleOf(entry, stageKo)}
                  </summary>
                  <DiaryDetail entry={entry} />
                </details>
              ) : (
                <span className="font-medium text-fg text-sm">
                  {titleOf(entry, stageKo)}
                </span>
              )}
            </div>

            {!FROM_CULTIVATION.has(entry.kind) && (
              <form action={onRemove}>
                <input name="plotId" type="hidden" value={plotId} />
                <input
                  name="cultivationId"
                  type="hidden"
                  value={cultivationId}
                />
                <input name="eventId" type="hidden" value={entry.id} />
                <SubmitButton pendingKo="지우는 중" size="sm" variant="ghost">
                  지우기
                </SubmitButton>
              </form>
            )}
          </li>
        );
      })}
    </ul>
  );
}
