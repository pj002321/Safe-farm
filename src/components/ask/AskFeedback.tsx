"use client";

import { useState } from "react";
import { Button } from "@/components/shared/Button";

/**
 * ---------------------------------------------
 * [Feature]: 답변 평가 — 도움됨 · 도움안됨 + 사유
 *
 * [Description]
 * - 평가만 받으면 검색 품질을 어디부터 고칠지 알 수 없다. 그래서 "도움안됨" 에는
 *   사유를 한 번 더 묻는다. **"도움됨"에는 묻지 않는다** — 잘 된 경우까지 붙잡으면
 *   다음부터 아무 버튼도 안 누른다.
 * - 사유는 선택이다. 건너뛰어도 평가는 이미 저장돼 있다(버튼을 누른 시점에 보낸다).
 * - 사유 칸에 개인정보를 적지 말라고 미리 적어 둔다. 자유 입력이라 연락처·주소가
 *   들어오는데, 받은 뒤에 지우는 것보다 안 받는 편이 낫다.
 * - 실패해도 화면을 되돌리지 않는다. 평가는 부가 기능이라, 안 됐다고 답변 위에
 *   오류를 띄우면 손해가 더 크다. 한 줄로만 알린다.
 * - 끝나면 버튼을 잠근다. 열어 두면 같은 답변에 평가가 여러 번 쌓이고, 누를 때마다
 *   요청이 나간다. 실패했을 때만 다시 열어 준다.
 * ---------------------------------------------
 */

interface AskFeedbackProps {
  historyId: string;
}

/** ai-service `FEEDBACK_REASON_MAX` 와 같은 값. */
const REASON_MAX_LENGTH = 200;

type Rating = "up" | "down";

export function AskFeedback({ historyId }: AskFeedbackProps) {
  const [rating, setRating] = useState<Rating | null>(null);
  const [reason, setReason] = useState("");
  const [reasonSent, setReasonSent] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function send(next: Rating, withReason: string | null) {
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch(
        `/api/ai/ask/${encodeURIComponent(historyId)}/feedback`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rating: next, reason: withReason }),
        },
      );
      if (!response.ok) setFailed(true);
    } catch {
      setFailed(true);
    }
    setBusy(false);
  }

  // "도움됨"은 누른 즉시, "도움안됨"은 사유를 보내거나 건너뛴 시점에 끝난다.
  const done = rating === "up" || (rating === "down" && reasonSent);
  const locked = done && !failed;

  function pick(next: Rating) {
    if (busy || locked) return;
    // 평가를 바꾸면 사유도 처음부터다. 안 지우면 "도움안됨"을 다시 골랐을 때
    // 이전에 보낸 흔적이 남아 사유 칸이 아예 안 뜬다.
    if (next !== rating) {
      setReason("");
      setReasonSent(false);
    }
    setRating(next);
    void send(next, null);
  }

  function submitReason() {
    if (busy || rating === null) return;
    const trimmed = reason.trim().slice(0, REASON_MAX_LENGTH);
    setReasonSent(true);
    void send(rating, trimmed);
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-fg-muted text-xs">
          이 답변이 도움이 되었나요?
        </span>
        <Button
          aria-pressed={rating === "up"}
          disabled={busy || locked}
          onClick={() => pick("up")}
          size="sm"
          variant={rating === "up" ? "telemetry" : "outline"}
        >
          도움됨
        </Button>
        <Button
          aria-pressed={rating === "down"}
          disabled={busy || locked}
          onClick={() => pick("down")}
          size="sm"
          variant={rating === "down" ? "telemetry" : "outline"}
        >
          도움안됨
        </Button>
      </div>

      {rating === "down" && !reasonSent && (
        <div className="flex flex-col gap-2">
          <label
            className="text-fg-muted text-xs"
            htmlFor="ask-feedback-reason"
          >
            어떤 점이 아쉬웠는지 알려 주시면 검색을 고치는 데 씁니다. (선택)
          </label>
          <textarea
            className="min-h-16 w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-fg text-sm outline-none focus:border-accent"
            id="ask-feedback-reason"
            maxLength={REASON_MAX_LENGTH}
            onChange={(event) => setReason(event.target.value)}
            placeholder="예) 내 밭 작물과 다른 작물 이야기였습니다"
            value={reason}
          />
          <p className="text-fg-subtle text-xs">
            이름·연락처 같은 개인정보는 적지 말아 주세요.
          </p>
          <div className="flex gap-2">
            <Button
              disabled={busy || reason.trim().length === 0}
              onClick={submitReason}
              size="sm"
              variant="secondary"
            >
              사유 보내기
            </Button>
            <Button
              disabled={busy}
              onClick={() => setReasonSent(true)}
              size="sm"
              variant="ghost"
            >
              건너뛰기
            </Button>
          </div>
        </div>
      )}

      {locked && (
        <output className="block text-good text-xs">
          평가를 보냈습니다. 고맙습니다.
        </output>
      )}

      {failed && (
        <p className="text-caution text-xs">평가를 저장하지 못했습니다.</p>
      )}
    </div>
  );
}
