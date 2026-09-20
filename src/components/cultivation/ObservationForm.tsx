import { SubmitButton } from "@/components/shared/SubmitButton";
import {
  SKY_KINDS,
  WORK_KINDS,
} from "@/features/cultivations/domain/diaryFields";
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
 *
 * [영농일지 — 2026-09-20 추가]
 * - 농민이 이 기록을 보조금·인증 서류로 낸다. 그래서 메모 한 줄이 아니라 **그날
 *   무슨 날씨에 무슨 일을 했나**가 한 행에 남아야 한다.
 * - **치는 것은 메모 하나뿐이다.** 기온·강수·습도·바람·일출일몰과 생육 단계는
 *   저장할 때 서버가 박는다(`actions.ts` 의 `addObservation`).
 * - **줄이 늘지 않는다.** 하늘은 날짜와 한 줄을 나눠 쓰고, 한 일만 접힌 칸에
 *   둔다. 한 줄 적고 끝낼 수 있어야 매일 쓴다.
 * - **날씨 미리보기를 두지 않는다.** 보여주려면 날짜를 고칠 때마다 다시 부르게
 *   되어 위의 "Client Component 가 아니다" 가 깨진다. 네이티브 `<select>` 라
 *   JS 가 0줄이다.
 * - **기본값을 두지 않는다.** 두면 안 펼친 사람의 일지가 전부 '물주기' 가 되고
 *   그게 그대로 서류에 실린다. 안 고르면 빈칸으로 저장된다.
 * ---------------------------------------------
 */

export interface ObservationFormProps {
  plotId: string;
  cultivationId: string;
  /** 오늘 (`"YYYY-MM-DD"`). 서버가 정한 값을 그대로 쓴다. */
  today: string;
  onSubmit: (formData: FormData) => Promise<void>;
}

/**
 * 접어 두는 칸. 안에 든 것은 `한 일` 하나뿐이다.
 *
 * 값을 받지 않는다 — 라디오 이름(`workKind`) 으로 바깥 `<form>` 에 그대로 붙는다.
 * 기본 선택을 두지 않으므로 안 펼친 사람은 이 칸이 빈 채로 저장된다.
 */
function WorkKindDetails() {
  return (
    <details className="rounded-lg border border-border bg-surface-2 px-4 py-3">
      <summary className="cursor-pointer text-fg-muted text-sm">
        자세히 적기
      </summary>

      <fieldset className="mt-3 flex flex-col gap-2 border-0 p-0">
        <legend className="font-medium text-fg text-sm">한 일</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {WORK_KINDS.map((work) => (
            <label
              className="flex items-center gap-1.5 text-fg-muted text-sm"
              key={work}
            >
              <input name="workKind" type="radio" value={work} />
              {work}
            </label>
          ))}
        </div>
      </fieldset>

      <p className="mt-3 text-fg-muted text-xs">
        고르는 것은 이 둘뿐입니다. 기온·강수·습도·바람·일출일몰과 생육 단계는
        저장할 때 함께 남습니다.
      </p>
    </details>
  );
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

      {/* 하늘은 날짜에 딸린 값이라 같은 줄을 나눠 쓴다. 따로 줄을 주면 폼이 길어지고
          길어지면 매일 안 쓴다 */}
      <div className="flex flex-wrap gap-3">
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

        <label className="flex flex-col gap-1">
          <span className="font-medium text-fg text-sm">그날 하늘</span>
          <select
            className="w-fit rounded-lg border border-border bg-surface px-3 py-2 text-fg text-sm"
            defaultValue=""
            name="skyKo"
          >
            {/* 기본값이 빈 항목이다. '맑음' 을 기본으로 두면 안 고른 사람의 일지가
                전부 맑음이 된다 */}
            <option value="">고르기</option>
            {SKY_KINDS.map((sky) => (
              <option key={sky} value={sky}>
                {sky}
              </option>
            ))}
          </select>
        </label>
      </div>

      <WorkKindDetails />

      <SubmitButton pendingKo="남기는 중" size="sm">
        기록 남기기
      </SubmitButton>
    </form>
  );
}
