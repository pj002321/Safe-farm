import { ArrowRightIcon } from "@/components/icons";

/**
 * ---------------------------------------------
 * [Feature]: 넓은 화면(lg+)의 단계 이동 막대
 *
 * [Description]
 * - **화면 아래에 붙어 따라온다**(`sticky bottom-0`). 예전에는 폼 맨 끝에 그냥
 *   놓여 있어서, 지도가 있는 1단계에서는 스크롤을 내려야 다음 버튼이 나왔다.
 * - 이 sticky 가 `page.tsx` 의 **하드코딩 높이 세 벌을 걷어냈다.**
 *   예전 주석대로라면 단계마다 내용 높이가 달라 버튼이 튀므로
 *   `min-h-[38rem] sm:min-h-[40rem] lg:min-h-[32rem]` 로 눈으로 재서 맞춰야 했다.
 *   지금은 폼이 세로 flex 이고 패널이 `flex-1` 이라 이 막대가 **언제나 화면 아래**에
 *   있다. 내용이 짧으면 컨테이너 바닥(=화면 바닥)에, 길면 sticky 로 붙어서.
 *   손으로 잰 값이 사라졌으니 단계를 추가해도 다시 잴 일이 없다.
 * - 좁은 화면에서는 숨긴다. 거기서는 `PlotWizardDock` 이 같은 일을 하는데, 둘을
 *   같이 두면 화면 아래에 막대가 둘 쌓인다(그게 원래 문제였다).
 * - 라벨만 단계에 따라 갈아 끼운다. `group-has-[…]` 클래스를 반복문으로 만들 수
 *   없어서(Tailwind 가 클래스 문자열을 정적으로 읽는다) 세 벌을 리터럴로 적는다.
 * - `<button>` 이 아니라 `<label>` 인 이유: 버튼으로 만들면 상태를 JS 로 들고
 *   있어야 하고, 폼 안의 button 은 실수로 제출을 일으킨다. 마지막 단계의
 *   제출만 진짜 `<button type="submit">` 이다.
 * - ⚠️ `backdrop-blur` 가 붙어 있다. 이 막대 **안에 `fixed` 를 넣지 말 것** —
 *   `backdrop-filter` 는 하위 fixed 요소의 기준 블록이 되어 찌그러뜨린다.
 * ---------------------------------------------
 */

/** 진행 막대 채움. 세 너비 중 현재 단계 하나만 맞는다. */
const FILL =
  "group-has-[#wizard-1:checked]/wizard:w-1/3 group-has-[#wizard-2:checked]/wizard:w-2/3 group-has-[#wizard-3:checked]/wizard:w-full";

export function WizardNav() {
  return (
    <div className="sticky bottom-0 z-30 mt-8 hidden lg:block">
      <div className="relative overflow-hidden rounded-t-xl border-border border-x border-t bg-bg/85 backdrop-blur">
        {/* 진행 막대. 단계 이름만으로는 "얼마나 남았나"가 안 읽힌다. */}
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 block h-0.5 bg-fg/10"
        >
          <span
            className={`block h-full bg-accent transition-[width] duration-500 ease-out-expo ${FILL}`}
          />
        </span>

        <div className="px-5 py-4">
          <NavRow
            className="hidden group-has-[#wizard-1:checked]/wizard:flex"
            nextId="wizard-2"
            nextKo="텃밭 정보"
            stepKo="위치 지정"
            stepNo={1}
          />
          <NavRow
            className="hidden group-has-[#wizard-2:checked]/wizard:flex"
            nextId="wizard-3"
            nextKo="작물 선택"
            prevId="wizard-1"
            prevKo="위치 지정"
            stepKo="텃밭 정보"
            stepNo={2}
          />
          <NavRow
            className="hidden group-has-[#wizard-3:checked]/wizard:flex"
            prevId="wizard-2"
            prevKo="텃밭 정보"
            stepKo="작물 선택"
            stepNo={3}
            submit
          />
        </div>
      </div>
    </div>
  );
}

function NavRow({
  className,
  prevId,
  prevKo,
  nextId,
  nextKo,
  stepNo,
  stepKo,
  submit,
}: {
  className: string;
  prevId?: string;
  prevKo?: string;
  nextId?: string;
  nextKo?: string;
  stepNo: number;
  stepKo: string;
  submit?: boolean;
}) {
  return (
    <div className={`${className} items-center gap-4`}>
      {prevId ? (
        <label
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-2 font-medium text-fg-muted text-sm transition-colors duration-200 ease-out-expo hover:bg-surface-2 hover:text-fg"
          htmlFor={prevId}
        >
          <ArrowRightIcon className="rotate-180" />
          {prevKo}
        </label>
      ) : (
        // 1단계에는 이전이 없다. 자리를 남겨야 가운데 글자가 안 움직인다.
        <span aria-hidden="true" className="w-28" />
      )}

      <span className="flex flex-1 items-center justify-center gap-2 text-sm">
        <span className="font-mono text-fg-subtle text-xs tabular-nums">
          {stepNo} / 3
        </span>
        <span className="font-medium text-fg">{stepKo}</span>
      </span>

      {submit ? (
        <button
          className="inline-flex items-center gap-2 rounded-md bg-accent px-6 py-3 font-medium text-accent-on text-base transition-colors duration-200 ease-out-expo hover:bg-accent-hover"
          type="submit"
        >
          텃밭 등록하기
          <ArrowRightIcon />
        </button>
      ) : (
        nextId && (
          <label
            className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-accent px-5 py-2.5 font-medium text-accent-on text-sm transition-colors duration-200 ease-out-expo hover:bg-accent-hover"
            htmlFor={nextId}
          >
            {nextKo}
            <ArrowRightIcon />
          </label>
        )
      )}
    </div>
  );
}
