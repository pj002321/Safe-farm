import { CheckIcon } from "@/components/icons";

/**
 * ---------------------------------------------
 * [Feature]: 단계 표시기
 *
 * [Description]
 * - 여러 단계로 나뉜 흐름에서 "지금 몇 번째이고 몇 개가 남았는지"를 보여준다.
 *   진행률 막대가 아니라 단계 이름을 쓰는 이유는, 가입처럼 단계 수가 적고
 *   각 단계가 무엇인지 미리 알려 주는 편이 이탈을 줄이기 때문이다.
 * - `<ol>` 로 그린다. 순서가 의미를 가지므로 div 로 흉내 내면 스크린리더가
 *   "1/2 단계"라는 구조를 잃는다. 현재 단계에는 `aria-current="step"` 을 준다.
 * - 지나온 단계는 체크로 바꾼다. 숫자만 두면 어디까지 했는지 색으로만 구분되어
 *   색각 이상에서 읽히지 않는다.
 * - `onSelect` 를 주면 **지나온 단계가 버튼이 된다.** 별도의 "이전" 버튼을
 *   두지 않고도 돌아갈 수 있어야 한다 — 돌아갈 길이 없으면 약관을 다시 읽거나
 *   선택 동의를 취소할 방법이 사라진다. 아직 오지 않은 단계는 누를 수 없다
 *   (건너뛰기를 허용하면 앞 단계의 검증을 우회하게 된다).
 *
 * [Usage]
 * ```tsx
 * <StepIndicator current={2} steps={["약관 동의", "계정 만들기"]} onSelect={setStep} />
 * ```
 * ---------------------------------------------
 */

interface StepIndicatorProps {
  /** 1부터 시작하는 현재 단계. */
  current: number;
  steps: readonly string[];
  /** 지나온 단계를 눌렀을 때. 없으면 표시 전용이다. */
  onSelect?: (step: number) => void;
}

export function StepIndicator({
  current,
  steps,
  onSelect,
}: StepIndicatorProps) {
  return (
    <ol className="flex items-center gap-2">
      {steps.map((label, index) => {
        const step = index + 1;
        const done = step < current;
        const active = step === current;
        const clickable = done && onSelect !== undefined;

        const marker = (
          <span
            className={`flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-xs transition-colors duration-200 ease-out-expo ${
              done
                ? "bg-accent text-accent-on"
                : active
                  ? "border border-accent text-accent"
                  : "border border-border text-fg-subtle"
            }`}
          >
            {done ? <CheckIcon className="size-3" strokeWidth={3} /> : step}
          </span>
        );

        const text = (
          <span
            className={`truncate text-xs ${
              active ? "font-medium text-fg" : "text-fg-subtle"
            }`}
          >
            {label}
          </span>
        );

        return (
          <li
            aria-current={active ? "step" : undefined}
            className="flex flex-1 items-center gap-2"
            key={label}
          >
            {clickable ? (
              // 접근성 이름을 aria-label 로 통째로 준다. sr-only 텍스트를 덧붙이면
              // 라벨과 이어 붙어 "약관 동의단계로 돌아가기"처럼 붙어 읽힌다.
              <button
                aria-label={`${label} 단계로 돌아가기`}
                className="flex items-center gap-2 rounded-sm transition-opacity hover:opacity-80"
                onClick={() => onSelect(step)}
                type="button"
              >
                {marker}
                {text}
              </button>
            ) : (
              <>
                {marker}
                {text}
              </>
            )}

            {/* 마지막 단계 뒤에는 연결선을 그리지 않는다. */}
            {step < steps.length && (
              <span
                aria-hidden="true"
                className={`h-px flex-1 ${done ? "bg-accent" : "bg-border"}`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
