import { WeatherStrip } from "@/components/cultivation/WeatherStrip";
import { SubmitButton } from "@/components/shared/SubmitButton";
import {
  hasWeather,
  type TimelineEntry,
} from "@/features/cultivations/domain/timeline";

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

/** 한 줄의 제목. 이름·한 일·단계를 가운뎃점으로 잇는다. */
function titleOf(entry: TimelineEntry, stageKo: string | null): string {
  return [entry.titleKo, entry.workKindKo, stageKo].filter(Boolean).join(" · ");
}

/** 접었다 펼 만한 속이 있나. 없으면 제목만 그린다. */
function hasDetail(entry: TimelineEntry): boolean {
  return (
    entry.bodyKo !== null ||
    entry.adviceTextKo !== null ||
    hasWeather(entry.weather)
  );
}

/** 펼쳤을 때 보이는 것. 접힌 줄에서는 아예 안 그린다. */
function Detail({ entry }: { entry: TimelineEntry }) {
  return (
    <div className="mt-2 flex flex-col gap-2">
      {entry.bodyKo && (
        <p className="whitespace-pre-wrap wrap-break-word text-fg-muted text-sm">
          {entry.bodyKo}
        </p>
      )}

      <WeatherStrip weather={entry.weather} />

      {/* 그날 AI 리포트. 문단이 길어 한 겹 더 접는다 */}
      {entry.adviceTextKo && (
        <details className="text-fg-muted text-xs">
          <summary className="cursor-pointer">그날 AI 조언</summary>
          <p className="mt-2 whitespace-pre-wrap wrap-break-word">
            {entry.adviceTextKo}
          </p>
        </details>
      )}
    </div>
  );
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
                  <Detail entry={entry} />
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
