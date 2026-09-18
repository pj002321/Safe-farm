"use client";

import { Badge } from "@/components/shared/Badge";
import { hideCitations } from "@/features/ask/domain/askAnswerText";
import type { AskMatch } from "@/features/ask/domain/askStream";
import { AskFeedback } from "./AskFeedback";

/**
 * ---------------------------------------------
 * [Feature]: 답변 본문 · 근거 문서 · 평가
 *
 * [Description]
 * - **근거를 답변과 같은 화면에 둔다.** 답변만 띄우면 이게 검색된 자료에서 나온
 *   것인지 모델이 지어낸 것인지 구분할 길이 사용자에게 없다.
 * - 근거는 접어 둔다. 평소에 읽을 글이 아니라 "의심스러울 때 펴 보는" 글이라
 *   펼쳐 두면 답변이 밀려 내려간다. `<details>` 라 JS 가 0줄이다.
 * - 조각 본문을 통째로 보여주지 않고 앞부분만 자른다. 원문은 문서 단위로 길고,
 *   여기서 필요한 건 "이 대목에서 나왔다"를 확인하는 것까지다.
 * - 스트리밍 중에는 커서를 붙여 아직 오는 중임을 보인다. 없으면 답변이 짧게
 *   끝난 것인지 끊긴 것인지 구분되지 않는다.
 * ---------------------------------------------
 */

interface AskAnswerProps {
  answer: string;
  matches: readonly AskMatch[];
  /** 답변 대신 띄우는 고정 문구(가드레일·근거 없음·한도 초과). 없으면 null. */
  noticeKo: string | null;
  historyId: string | null;
  streaming: boolean;
}

/** 근거 조각 미리보기 길이. 이보다 길면 잘라서 말줄임을 붙인다. */
const EXCERPT_LENGTH = 220;

export function AskAnswer({
  answer,
  matches,
  noticeKo,
  historyId,
  streaming,
}: AskAnswerProps) {
  if (noticeKo !== null && answer.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface-2 px-4 py-3">
        <p className="text-fg text-sm leading-relaxed">{noticeKo}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-border bg-surface px-4 py-4">
        <p className="whitespace-pre-wrap text-fg text-sm leading-relaxed">
          {hideCitations(answer)}
          {streaming && (
            <span
              aria-hidden="true"
              className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-accent align-text-bottom"
            />
          )}
        </p>

        {streaming && answer.length === 0 && (
          <p className="text-fg-subtle text-sm">자료를 찾고 있습니다…</p>
        )}
      </div>

      {noticeKo !== null && (
        <p className="text-caution text-xs leading-relaxed">{noticeKo}</p>
      )}

      {matches.length > 0 && <Sources matches={matches} />}

      {!streaming && historyId !== null && answer.length > 0 && (
        <AskFeedback historyId={historyId} />
      )}
    </div>
  );
}

function Sources({ matches }: { matches: readonly AskMatch[] }) {
  return (
    <details className="rounded-xl border border-border bg-surface-2 [&_summary]:list-none">
      <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-fg-muted text-sm">
        <Badge size="sm" tone="telemetry">
          근거 {matches.length}건
        </Badge>
        <span>이 답변이 참고한 자료 보기</span>
      </summary>
      <ul className="flex flex-col gap-3 border-border border-t px-4 py-3">
        {matches.map((match, index) => (
          <SourceItem
            // 조각에 id 가 오지 않는다. 목록이 다시 정렬되지 않으므로 순번으로 족하다.
            key={`${match.sourceTitleKo ?? "source"}-${index}`}
            match={match}
          />
        ))}
      </ul>
    </details>
  );
}

function SourceItem({ match }: { match: AskMatch }) {
  const excerpt =
    match.body.length > EXCERPT_LENGTH
      ? `${match.body.slice(0, EXCERPT_LENGTH)}…`
      : match.body;

  return (
    <li className="flex flex-col gap-1">
      <p className="font-medium text-fg text-xs">
        {match.sourceTitleKo ?? "제목 없는 자료"}
      </p>
      <p className="text-fg-muted text-xs leading-relaxed">{excerpt}</p>
    </li>
  );
}
