import { SubmitButton } from "@/components/shared/SubmitButton";
import { USER_STAGE_NAME_MAX_LENGTH } from "@/features/cultivations/domain/userStage";

/**
 * ---------------------------------------------
 * [Feature]: 생육단계 직접 더하기
 *
 * [Description]
 * - 단계표에 없는 일을 그 재배에만 붙인다. 고추를 거둔 뒤의 **말림·가공**처럼
 *   작물 공통 자료에는 없지만 그 사람에게는 단계인 것. 단계표(`crop_stages`)는
 *   건드리지 않는다 — 한 사람이 고치면 남의 화면이 같이 바뀐다.
 * - **앞날짜를 받는다.** 관찰 기록과 반대다. "언제 할 것인가" 를 미리 적을 수
 *   있어야 해서 `max` 를 걸지 않는다. 안 온 날은 타임라인에 연하게 그려진다.
 * - 접어 둔다(`<details>`). 대부분은 더할 일이 없고, 열어 두면 단계표가 모자란
 *   것처럼 보인다.
 * - 지우기는 여기 없다. 더한 단계는 **지나온 기록**에 같은 줄로 서고 지우기
 *   버튼이 거기 있다(`RecordTimeline`).
 *
 * 붙는 자리와 순서 규칙은 `domain/stageTimeline.ts` 의 `appendUserStages` 가 정한다.
 * ---------------------------------------------
 */

export interface StageAddFormProps {
  plotId: string;
  cultivationId: string;
  /** 오늘 (`"YYYY-MM-DD"`). 기본값으로만 쓰고 상한으로 쓰지 않는다. */
  today: string;
  onSubmit: (formData: FormData) => Promise<void>;
}

export function StageAddForm({
  plotId,
  cultivationId,
  today,
  onSubmit,
}: StageAddFormProps) {
  return (
    <details className="rounded-lg border border-border bg-surface-2 px-4 py-3">
      <summary className="cursor-pointer text-fg-muted text-sm">
        뒤에 할 일이 더 있나요?
      </summary>

      <form action={onSubmit} className="mt-3 flex flex-wrap items-end gap-3">
        <input name="plotId" type="hidden" value={plotId} />
        <input name="cultivationId" type="hidden" value={cultivationId} />

        <label className="flex flex-col gap-1">
          <span className="font-medium text-fg text-sm">단계 이름</span>
          <input
            className="rounded-lg border border-border bg-surface px-3 py-2 text-fg text-sm"
            maxLength={USER_STAGE_NAME_MAX_LENGTH}
            name="nameKo"
            placeholder="말림"
            type="text"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-medium text-fg text-sm">그날</span>
          <input
            className="rounded-lg border border-border bg-surface px-3 py-2 text-fg text-sm"
            defaultValue={today}
            name="occurredOn"
            type="date"
          />
        </label>

        <SubmitButton pendingKo="더하는 중" size="sm" variant="secondary">
          단계 더하기
        </SubmitButton>
      </form>

      <p className="mt-2 text-fg-muted text-xs">
        마지막 단계 뒤에 붙습니다. 아직 안 온 날짜도 적을 수 있고, 그때는 연하게
        표시됩니다. 생육 예측에는 쓰지 않습니다.
      </p>
    </details>
  );
}
