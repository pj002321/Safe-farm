"use client";

/**
 * ---------------------------------------------
 * [Feature]: 추천 질문 칩 3개
 *
 * [Description]
 * - 빈 입력칸만 두면 사용자는 무엇을 물어도 되는지 모른다. 지금 밭에서 실제로 할
 *   법한 질문을 대신 적어 둔다.
 * - 누르면 **보내지 않고 입력칸에 넣는다.** 하루 횟수가 정해져 있어서, 한 번의
 *   오클릭이 한 번의 질문을 태우면 안 된다. 사용자가 고쳐 쓸 여지도 남는다.
 * - 질문은 서버가 정한다(`ai-service/app/domain/ask_suggest.py`). 여기서 문장을
 *   만들면 생육단계 이름을 화면이 알아야 하고, 그 순간 두 벌이 된다.
 * ---------------------------------------------
 */

interface AskSuggestionChipsProps {
  questions: readonly string[];
  /** 어느 작물·단계 기준인가. 밭을 안 골랐으면 null. */
  basisKo: string | null;
  onPick: (question: string) => void;
}

export function AskSuggestionChips({
  questions,
  basisKo,
  onPick,
}: AskSuggestionChipsProps) {
  if (questions.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <p className="text-fg-muted text-xs">
        {basisKo
          ? `${basisKo} 기준으로 이런 것을 물어보실 수 있습니다`
          : "이런 것을 물어보실 수 있습니다"}
      </p>
      <ul className="flex flex-wrap gap-2">
        {questions.map((question) => (
          <li key={question}>
            <button
              className="rounded-full border border-border bg-surface px-3 py-1.5 text-fg-muted text-sm transition-colors duration-200 ease-out-expo hover:border-accent hover:text-accent"
              onClick={() => onPick(question)}
              type="button"
            >
              {question}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
