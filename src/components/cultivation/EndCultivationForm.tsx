import { Button } from "@/components/shared/Button";
import { FAILURE_REASONS } from "@/features/cultivations/domain/failureReason";

/**
 * ---------------------------------------------
 * [Feature]: 재배 끝내기 (수확 · 중단)
 *
 * [Description]
 * - 끝내는 길이 둘이다. 거뒀으면 수확, 못 거뒀으면 중단이고 **중단은 사유를
 *   같이 받는다.** 왜 그만뒀나가 쌓여야 어느 단계에서 사람들이 떨어지는지 보인다.
 * - 사유는 선택지로만 받는다. 자유 입력은 같은 뜻이 열 가지 문장으로 들어와
 *   집계가 안 된다(`failureReason.ts`).
 * - 중단은 접어 둔다. 눌러서 되돌릴 수 없는 동작이라 실수로 닿지 않게 한다.
 * - 지우기와 다르다. 지우기는 **잘못 등록한 건**을 정정하고, 이쪽은 실제로
 *   있었던 재배를 끝난 것으로 남긴다.
 * ---------------------------------------------
 */

export interface EndCultivationFormProps {
  plotId: string;
  cultivationId: string;
  onHarvest: (formData: FormData) => Promise<void>;
  onFail: (formData: FormData) => Promise<void>;
}

export function EndCultivationForm({
  plotId,
  cultivationId,
  onHarvest,
  onFail,
}: EndCultivationFormProps) {
  return (
    <div className="flex flex-col gap-3">
      <form action={onHarvest}>
        <input name="plotId" type="hidden" value={plotId} />
        <input name="cultivationId" type="hidden" value={cultivationId} />
        <Button size="sm" type="submit">
          수확 완료로 기록
        </Button>
      </form>

      <details className="rounded-lg border border-border bg-surface-2 px-4 py-3">
        <summary className="cursor-pointer text-fg-muted text-sm">
          이 작물은 못 거뒀습니다
        </summary>

        <form action={onFail} className="mt-3 flex flex-wrap items-end gap-3">
          <input name="plotId" type="hidden" value={plotId} />
          <input name="cultivationId" type="hidden" value={cultivationId} />

          <label className="flex flex-col gap-1">
            <span className="font-medium text-fg text-sm">사유</span>
            <select
              className="rounded-lg border border-border bg-surface px-3 py-2 text-fg text-sm"
              name="reason"
            >
              {FAILURE_REASONS.map((reason) => (
                <option key={reason.code} value={reason.code}>
                  {reason.labelKo} — {reason.hintKo}
                </option>
              ))}
            </select>
          </label>

          <Button size="sm" type="submit" variant="danger">
            중단으로 기록
          </Button>
        </form>
      </details>
    </div>
  );
}
