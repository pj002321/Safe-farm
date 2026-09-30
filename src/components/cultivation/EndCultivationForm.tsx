import { SubmitButton } from "@/components/shared/SubmitButton";
import { FAILURE_REASONS } from "@/features/cultivations/domain/failureReason";

/**
 * ---------------------------------------------
 * [Feature]: 재배 끝내기 (수확 · 중단)
 *
 * [Description]
 * - 끝내는 길이 둘이다. 거뒀으면 수확, 못 거뒀으면 중단이고 **중단은 사유를
 *   같이 받는다.** 왜 그만뒀나가 쌓여야 어느 단계에서 사람들이 떨어지는지 보인다.
 * - 수확 쪽은 **수확량(kg)을 같이 받는다**(2026-09-22). 적을 자리가 어디에도 없어
 *   마이페이지의 `— kg` 과 연도별 합계의 `기록 없음` 이 늘 그 값이었다. 읽는 쪽은
 *   이미 다 지어져 있어 이 칸 하나면 살아난다.
 *   ⚠️ 모달로 띄우지 않는다. 이 카드는 `{!ended && …}` 라 기르는 중일 때만 보이고,
 *      수확을 누르면 카드째 사라져 수확 요약이 그 자리를 대신한다 — 칸은 늘 놓여 있으면 된다.
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
      <form action={onHarvest} className="flex flex-col items-start gap-2">
        <input name="plotId" type="hidden" value={plotId} />
        <input name="cultivationId" type="hidden" value={cultivationId} />

        {/* ⚠️ `required` 를 붙이지 않는다. 지금까지 버튼 한 번이면 끝나던 일이라,
            칸이 생겼다고 손이 무거워지면 안 된다. 비우면 `— kg` 으로 남는다.
            모양은 밭 등록의 '대략 면적' 칸을 따르되 단위 select 는 안 붙인다 — kg 하나로 고정. */}
        <label className="flex flex-col gap-1">
          <span className="font-medium text-fg text-sm">수확량</span>
          <span className="flex items-center gap-2">
            <input
              className="w-28 rounded-lg border border-border bg-surface px-3 py-2 text-fg text-sm placeholder:text-fg-subtle transition-colors hover:border-accent focus:border-accent"
              inputMode="decimal"
              min="0"
              name="yieldKg"
              placeholder="예: 120"
              step="0.1"
              type="number"
            />
            <span className="text-fg-muted text-sm">kg</span>
          </span>
        </label>
        <p className="text-fg-subtle text-xs">모르면 비워 두세요.</p>

        {/* ⚠️ 경고는 **버튼 바로 위, 수확량 칸과 같은 폼 안**에 둔다. 아래 `못 거뒀습니다`
            접기와 사이에 끼우면 무엇에 대한 경고인지 흐려진다.
            ⚠️ "기록 수정 불가" 라고는 쓰지 않는다 — 일지 줄의 `지우기` 는 아직 산다.
               되돌릴 수 없는 것은 **수확 자체와 수확량**이다. */}
        <p className="font-medium text-caution text-xs">
          ⚠ 저장하면 수정할 수 없습니다.
        </p>

        {/* 칸이 생기면서 이 버튼은 "상태를 바꾸는 버튼"이 아니라 "적은 것을 넣는
            버튼"이 됐다. 무엇을 하는지를 이름이 말해야 한다. */}
        <SubmitButton pendingKo="저장하는 중" size="sm">
          수확완료
        </SubmitButton>
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

          <SubmitButton pendingKo="기록하는 중" size="sm" variant="danger">
            중단으로 기록
          </SubmitButton>
        </form>
      </details>
    </div>
  );
}
