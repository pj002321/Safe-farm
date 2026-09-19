import { QuestionIcon } from "@/components/icons";
import { Badge } from "@/components/shared/Badge";
import { EmptyState } from "@/components/shared/EmptyState";
import type { AskHistoryEntry } from "@/features/ask/askHistoryStore";
import { hideCitations } from "@/features/ask/domain/askAnswerText";

/**
 * ---------------------------------------------
 * [Feature]: 마이페이지 — 질문 기록
 *
 * [Description]
 * - `/ask`에서 물은 것은 그 페이지를 벗어나면 화면에서 사라진다(브라우저 state일
 *   뿐이다). 답 자체는 `ask_history`에 이미 남아 있으므로, 여기서는 그걸 다시
 *   읽어 최신순으로 보여주기만 한다 — 새로 계산하거나 다시 묻지 않는다.
 * - 근거 문서는 `ask_history`에 저장되지 않는다(질문·답변·평가만 남긴다). 그래서
 *   이 목록에는 `AskAnswer.tsx`가 보여주는 "근거 N건" 접기가 없다.
 *
 * [Usage]
 * ```tsx
 * <AskHistoryPanel entries={await listAskHistory(profile.id)} />
 * ```
 * ---------------------------------------------
 */

interface AskHistoryPanelProps {
  entries: readonly AskHistoryEntry[];
}

const DATE_FORMAT = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function AskHistoryPanel({ entries }: AskHistoryPanelProps) {
  if (entries.length === 0) {
    return (
      <EmptyState
        actionHref="/ask"
        actionKo="질문하러 가기"
        bodyKo="재배 중 궁금한 것을 물으면 여기에 쌓여 언제든 다시 볼 수 있습니다."
        icon={<QuestionIcon />}
        titleKo="아직 물어본 것이 없습니다"
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {entries.map((entry) => (
        <li
          className="rounded-xl border border-border bg-surface px-5 py-4"
          key={entry.id}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium text-fg text-sm">{entry.question}</p>
            <div className="flex items-center gap-2">
              {entry.rating !== null && (
                <Badge
                  size="sm"
                  tone={entry.rating === "up" ? "good" : "caution"}
                >
                  {entry.rating === "up" ? "도움됨" : "도움 안 됨"}
                </Badge>
              )}
              <span className="font-mono text-fg-subtle text-xs tabular-nums">
                {DATE_FORMAT.format(new Date(entry.createdAt))}
              </span>
            </div>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-fg-muted text-sm leading-relaxed">
            {hideCitations(entry.answerKo)}
          </p>
        </li>
      ))}
    </ul>
  );
}
