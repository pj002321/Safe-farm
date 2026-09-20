import { SubmitButton } from "@/components/shared/SubmitButton";
import {
  SKY_KINDS,
  WORK_KINDS,
} from "@/features/cultivations/domain/diaryFields";
import { NOTE_MAX_LENGTH } from "@/features/cultivations/domain/observationNote";
import {
  pickedHref,
  TASK_NOTE_MAX_LENGTH,
  taskNoteField,
  withoutPicked,
} from "@/features/cultivations/domain/pickedTasks";

/**
 * ---------------------------------------------
 * [Feature]: 관찰 기록 입력 (메모 · 담은 할 일)
 *
 * [Description]
 * - 날짜를 받는다. 어제 일을 오늘 적는 경우가 흔해서다. 앞날짜는 브라우저의
 *   `max` 와 서버의 `parseNote` 가 이중으로 막는다 — 브라우저 검사는 우회된다.
 * - 사진 칸은 없다. 업로드는 AI 사진 분석과 한 묶음이라 그 브랜치로 미뤘다.
 * - Client Component 가 아니다. 제출은 Server Action 이 받고 페이지가 다시 그려진다.
 *
 * [영농일지 — 2026-09-20 추가]
 * - 농민이 보조금·인증 서류를 쓸 때 **이 기록을 보고 옮겨 적는다.** 그래서 메모 한 줄이 아니라 **그날
 *   무슨 날씨에 무슨 일을 했나**가 한 행에 남아야 한다.
 * - **치는 것은 메모뿐이다.** 기온·강수·습도·바람·일출일몰과 생육 단계는
 *   저장할 때 서버가 박는다(`actions.ts` 의 `addObservation`).
 * - **줄이 늘지 않는다.** 하늘은 날짜와 한 줄을 나눠 쓰고, 나머지는 접힌 칸에
 *   둔다. 한 줄 적고 끝낼 수 있어야 매일 쓴다.
 * - **날씨 미리보기를 두지 않는다.** 보여주려면 날짜를 고칠 때마다 다시 부르게
 *   되어 위의 "Client Component 가 아니다" 가 깨진다. 네이티브 `<select>` 라
 *   JS 가 0줄이다.
 * - **기본값을 두지 않는다.** 두면 안 펼친 사람의 일지가 전부 '물주기' 가 되고
 *   그게 그대로 서류에 실린다. 안 고르면 빈칸으로 저장된다.
 *
 * [담은 할 일 — 2026-09-21]
 * - `이번 주 할 일` 에서 `했음` 을 누른 카드가 여기로 온다. **누른 것만으로는
 *   아직 아무것도 저장되지 않는다** — `기록 남기기` 를 눌러야 메모 한 줄과
 *   카드마다 한 줄이 같이 남는다.
 * - 담은 게 있으면 접힌 칸이 **열린 채로** 그려진다. 칸이 열린 까닭이 그것이라
 *   담은 카드가 `한 일` 위에 온다.
 * - ⚠ **`<details>` 의 `display` 를 바꾸지 않는다.** `flex` 를 걸면 브라우저에
 *   따라 **접힌 상태에서도 속이 다 보인다.** 칸 사이 간격은 자식의 `mt-3` 이
 *   맡는다 — 이 레포의 다른 `<details>` 넷도 같은 방식이다.
 * - ⚠ **`취소` 는 링크라 화면을 새로 받는다.** 적다 만 메모는 그때 사라진다.
 *   폼 값을 붙들려면 Client Component 가 되어야 하는데, 이 화면은 JS 가 0줄인
 *   것이 성질이다. 담기 전에 적는 일이 드물어 그 값을 치르기로 했다.
 * ---------------------------------------------
 */

export interface ObservationFormProps {
  plotId: string;
  cultivationId: string;
  /** 오늘 (`"YYYY-MM-DD"`). 서버가 정한 값을 그대로 쓴다. */
  today: string;
  /**
   * 지금 판정된 생육단계. 저장할 때 이 기록에 같이 박힌다.
   *
   * 화면이 이미 계산해 둔 값을 넘겨받는다 — 액션에서 다시 구하면 관측·평년값을
   * 또 읽어야 한다. 판정을 못 했으면 null 이고 그 칸은 빈 채로 저장된다.
   */
  currentStageOrder: number | null;
  /** `했음` 으로 담아 둔 카드 제목들. 비었으면 그 자리가 통째로 사라진다. */
  picked: readonly string[];
  onSubmit: (formData: FormData) => Promise<void>;
}

/**
 * 담아 둔 카드들. 제목 · 취소 링크 · 카드별 메모 한 줄.
 *
 * 제목을 숨은 칸으로 같이 보낸다 — 주소의 `picked` 는 액션까지 따라오지 않는다.
 * 액션이 받는 값이라 저쪽에서 다시 다듬는다.
 */
function PickedTasks({ picked }: { picked: readonly string[] }) {
  return (
    <fieldset className="flex flex-col gap-2 border-0 p-0">
      <legend className="font-medium text-fg text-sm">담은 할 일</legend>

      <ul className="flex flex-col gap-2">
        {picked.map((titleKo) => (
          <li
            className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2"
            key={titleKo}
          >
            <input name="pickedTitle" type="hidden" value={titleKo} />
            <span className="font-medium text-fg text-sm">{titleKo}</span>

            <input
              className="min-w-40 flex-1 rounded-md border border-border bg-surface px-2 py-1 text-fg text-sm"
              maxLength={TASK_NOTE_MAX_LENGTH}
              name={taskNoteField(titleKo)}
              placeholder="호스로 20분"
              type="text"
            />

            <a
              className="text-fg-subtle text-xs underline"
              href={pickedHref(withoutPicked(picked, titleKo))}
            >
              취소
            </a>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

/**
 * 접어 두는 칸. 담은 할 일과 `한 일` 이 들어간다.
 *
 * 값을 받지 않는다 — 라디오 이름(`workKind`) 으로 바깥 `<form>` 에 그대로 붙는다.
 * 기본 선택을 두지 않으므로 안 펼친 사람은 이 칸이 빈 채로 저장된다.
 */
function DetailFields({ picked }: { picked: readonly string[] }) {
  return (
    <details
      className="rounded-lg border border-border bg-surface-2 px-4 py-3"
      // 담은 게 있으면 열어 둔다. 서버가 붙이는 속성이라 JS 가 안 든다.
      open={picked.length > 0}
    >
      <summary className="cursor-pointer text-fg-muted text-sm">
        자세히 적기
      </summary>

      {picked.length > 0 && (
        <div className="mt-3">
          <PickedTasks picked={picked} />
        </div>
      )}

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
  currentStageOrder,
  picked,
  onSubmit,
}: ObservationFormProps) {
  return (
    <form action={onSubmit} className="flex flex-col gap-3">
      <input name="plotId" type="hidden" value={plotId} />
      <input name="cultivationId" type="hidden" value={cultivationId} />
      {currentStageOrder !== null && (
        <input name="stageOrder" type="hidden" value={currentStageOrder} />
      )}

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
          <span className="font-medium text-fg text-sm">날씨</span>
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

      <DetailFields picked={picked} />

      <SubmitButton pendingKo="남기는 중" size="sm">
        기록 남기기
      </SubmitButton>
    </form>
  );
}
