import { WeatherStrip } from "@/components/cultivation/WeatherStrip";
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
 * - **그날 날씨 띠를 같이 그린다**(`WeatherStrip`). 저장할 때 행에 박아 둔 값을
 *   그대로 읽는다 — 여기서 다시 조회하면 관측 정정 때 과거 일지가 바뀐다.
 *   날씨 칸이 전부 비면 띠가 아예 안 그려진다.
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

            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <span className="font-medium text-fg text-sm">
                {entry.titleKo}
                {entry.workKindKo ? ` · ${entry.workKindKo}` : ""}
                {stageKo ? ` · ${stageKo}` : ""}
              </span>

              {entry.bodyKo && (
                <p className="whitespace-pre-wrap break-words text-fg-muted text-sm">
                  {entry.bodyKo}
                </p>
              )}

              <WeatherStrip weather={entry.weather} />
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
