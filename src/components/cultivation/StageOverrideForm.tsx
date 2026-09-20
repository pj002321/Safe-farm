import { SubmitButton } from "@/components/shared/SubmitButton";
import type { StageRow } from "@/features/cultivations/domain/growthGauge";

/**
 * ---------------------------------------------
 * [Feature]: 생육단계 수동 보정
 *
 * [Description]
 * - 계산된 단계가 실제와 다를 때 사용자가 고친다. GDD 는 관측소 기온에서 오는데
 *   관측소는 밭에서 수 킬로미터 떨어져 있어 실제 밭과 어긋날 수 있다.
 * - **누적 GDD 를 저장하지 않는다.** 보정 사실만 기록(`STAGE_SET`)하고, 게이지는
 *   볼 때마다 그 기록을 반영해 다시 계산한다(`detailStore.ts` 의 `REBASE_RULE`).
 * - 접어 둔다(`<details>`). 대부분은 고칠 일이 없고, 열어 두면 계산 값이 틀렸다는
 *   인상을 준다.
 * ---------------------------------------------
 */

export interface StageOverrideFormProps {
  stages: readonly StageRow[];
  /** 지금 판정된 단계. 선택 기본값이 된다. */
  currentStageOrder: number | null;
  plotId: string;
  cultivationId: string;
  today: string;
  onSubmit: (formData: FormData) => Promise<void>;
}

export function StageOverrideForm({
  stages,
  currentStageOrder,
  plotId,
  cultivationId,
  today,
  onSubmit,
}: StageOverrideFormProps) {
  if (stages.length === 0) return null;

  return (
    <details className="rounded-lg border border-border bg-surface-2 px-4 py-3">
      <summary className="cursor-pointer text-fg-muted text-sm">
        단계가 실제와 다른가요?
      </summary>

      <form action={onSubmit} className="mt-3 flex flex-wrap items-end gap-3">
        <input name="plotId" type="hidden" value={plotId} />
        <input name="cultivationId" type="hidden" value={cultivationId} />

        <label className="flex flex-col gap-1">
          <span className="font-medium text-fg text-sm">실제 단계</span>
          <select
            className="rounded-lg border border-border bg-surface px-3 py-2 text-fg text-sm"
            defaultValue={currentStageOrder ?? stages[0].stageOrder}
            name="stageOrder"
          >
            {stages.map((stage) => (
              <option key={stage.stageOrder} value={stage.stageOrder}>
                {stage.stageNameKo}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-medium text-fg text-sm">그렇게 된 날</span>
          <input
            className="rounded-lg border border-border bg-surface px-3 py-2 text-fg text-sm"
            defaultValue={today}
            max={today}
            name="occurredOn"
            type="date"
          />
        </label>

        <SubmitButton pendingKo="고치는 중" size="sm" variant="secondary">
          단계 고치기
        </SubmitButton>
      </form>

      <p className="mt-2 text-fg-muted text-xs">
        고친 날부터 적산을 다시 시작합니다. 이전 기록은 지워지지 않습니다.
      </p>
    </details>
  );
}
