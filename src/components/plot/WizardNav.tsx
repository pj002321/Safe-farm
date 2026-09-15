import { Button } from "@/components/shared/Button";

/**
 * 단계 이동 줄.
 *
 * **패널 밖에 한 벌만 둔다.** 예전에는 각 패널 안에 넣었는데, 단계마다 내용
 * 높이가 달라 버튼이 매번 다른 자리로 튀었다. 위 패널 영역에 min-height 를
 * 걸고 이 줄을 그 아래 고정해 두면, 어느 단계에서도 같은 자리에 있다.
 *
 * 라벨만 단계에 따라 갈아 끼운다. 네 벌을 모두 렌더해 두고 현재 단계 것만
 * 보이게 하는데, `group-has-[…]` 클래스를 반복문으로 만들 수 없어서
 * (Tailwind 가 클래스 문자열을 정적으로 읽는다) 네 벌을 리터럴로 적는다.
 *
 * `<button>` 이 아니라 `<label>` 인 이유: 버튼으로 만들면 상태를 JS 로 들고
 * 있어야 하고, 폼 안의 button 은 실수로 제출을 일으킨다. 마지막 단계의
 * 제출만 진짜 `<button type="submit">` 이다.
 */
export function WizardNav() {
  return (
    <div className="mt-6 border-border border-t pt-5">
      <NavRow
        className="hidden group-has-[#wizard-1:checked]/wizard:flex"
        nextId="wizard-2"
        nextKo="텃밭 정보"
      />
      <NavRow
        className="hidden group-has-[#wizard-2:checked]/wizard:flex"
        nextId="wizard-3"
        nextKo="작물 선택"
        prevId="wizard-1"
        prevKo="위치 지정"
      />
      <NavRow
        className="hidden group-has-[#wizard-3:checked]/wizard:flex"
        nextId="wizard-4"
        nextKo="재배 정보"
        prevId="wizard-2"
        prevKo="텃밭 정보"
      />
      <NavRow
        className="hidden group-has-[#wizard-4:checked]/wizard:flex"
        prevId="wizard-3"
        prevKo="작물 선택"
        submit
      />

      <p className="mt-3 text-fg-subtle text-xs">
        입력하신 내용은 단계를 오가도 남아 있고, 자동으로 임시 저장됩니다.
      </p>
    </div>
  );
}

function NavRow({
  className,
  prevId,
  prevKo,
  nextId,
  nextKo,
  submit,
}: {
  className: string;
  prevId?: string;
  prevKo?: string;
  nextId?: string;
  nextKo?: string;
  submit?: boolean;
}) {
  return (
    <div
      className={`${className} flex-col-reverse gap-3 sm:flex-row sm:items-center`}
    >
      {prevId && (
        <label
          className="cursor-pointer rounded-md border border-border-strong px-4 py-2.5 text-center font-medium text-fg text-sm transition-colors duration-200 ease-out-expo hover:border-accent hover:text-accent"
          htmlFor={prevId}
        >
          ← {prevKo}
        </label>
      )}

      <span className="hidden flex-1 sm:block" />

      {submit ? (
        <Button size="lg" type="submit">
          텃밭 등록하기
        </Button>
      ) : (
        nextId && (
          <label
            className="cursor-pointer rounded-md bg-accent px-5 py-2.5 text-center font-medium text-accent-on text-sm transition-colors duration-200 ease-out-expo hover:bg-accent-hover"
            htmlFor={nextId}
          >
            {nextKo} →
          </label>
        )
      )}
    </div>
  );
}
