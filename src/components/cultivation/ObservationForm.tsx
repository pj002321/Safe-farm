import { Button } from "@/components/shared/Button";
import { NOTE_MAX_LENGTH } from "@/features/cultivations/domain/observationNote";

/**
 * ---------------------------------------------
 * [Feature]: 관찰 기록 입력 (메모)
 *
 * [Description]
 * - 빈 메모는 서버가 막는다(`parseNote`). 빈 줄이 타임라인에 그려지는 걸 막는다.
 * - 날짜를 받는다. 어제 일을 오늘 적는 경우가 흔해서다. 앞날짜는 브라우저의
 *   `max` 와 서버의 `parseNote` 가 이중으로 막는다 — 브라우저 검사는 우회된다.
 * - 사진 칸은 없다. 업로드는 AI 사진 분석과 한 묶음이라 그 브랜치로 미뤘다.
 * - Client Component 가 아니다. 제출은 Server Action 이 받고 페이지가 다시 그려진다.
 * ---------------------------------------------
 */

export interface ObservationFormProps {
  plotId: string;
  cultivationId: string;
  /** 오늘 (`"YYYY-MM-DD"`). 서버가 정한 값을 그대로 쓴다. */
  today: string;
  onSubmit: (formData: FormData) => Promise<void>;
}

export function ObservationForm({
  plotId,
  cultivationId,
  today,
  onSubmit,
}: ObservationFormProps) {
  return (
    <form action={onSubmit} className="flex flex-col gap-3">
      <input name="plotId" type="hidden" value={plotId} />
      <input name="cultivationId" type="hidden" value={cultivationId} />

      <label className="flex flex-col gap-1">
        <span className="font-medium text-fg text-sm">메모</span>
        <textarea
          className="min-h-24 rounded-lg border border-border bg-surface px-3 py-2 text-fg text-sm"
          maxLength={NOTE_MAX_LENGTH}
          name="body"
          placeholder="잎에 구멍이 생겼습니다"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-medium text-fg text-sm">날짜</span>
        <input
          className="w-fit rounded-lg border border-border bg-surface px-3 py-2 text-fg text-sm"
          defaultValue={today}
          max={today}
          name="occurredOn"
          type="date"
        />
      </label>

      <Button size="sm" type="submit">
        기록 남기기
      </Button>
    </form>
  );
}
