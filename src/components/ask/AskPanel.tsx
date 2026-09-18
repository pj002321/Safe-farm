"use client";

import { type FormEvent, useRef, useState } from "react";
import { Badge } from "@/components/shared/Badge";
import { Button } from "@/components/shared/Button";
import {
  parseQuestion,
  QUESTION_MAX_LENGTH,
} from "@/features/ask/domain/askQuestion";
import {
  type AskMatch,
  type AskQuotaWire,
  parseAskEvent,
  splitSseEvents,
} from "@/features/ask/domain/askStream";
import { AskAnswer } from "./AskAnswer";
import { AskSuggestionChips } from "./AskSuggestionChips";

/**
 * ---------------------------------------------
 * [Feature]: 질문 화면 — 입력 · 답변 스트리밍 · 근거 · 피드백
 *
 * [Description]
 * - 답변은 `/api/ai/ask` 가 SSE 로 흘려보낸다. 다 받고 한 번에 띄우면 첫 글자까지
 *   몇 초가 비는데, 그동안 사용자는 멈춘 줄 안다. 오는 대로 붙인다.
 * - **`EventSource` 를 쓰지 않는다.** 그건 GET 만 되고 질문은 POST 라서다. `fetch`
 *   본문을 직접 읽고 자르는 일은 `features/ask/domain/askStream.ts` 가 한다.
 * - 잔여 횟수는 화면이 세지 않는다. 서버가 응답에 실어 주는 값만 쓴다 — 여기서
 *   빼기 시작하면 다른 기기에서 쓴 횟수와 어긋난다.
 * - **밭을 고르면 그 밭 기준으로 답한다.** 고르지 않으면 일반론이 되는데, 그
 *   차이를 화면에 적어 둔다. 적지 않으면 사용자는 왜 답이 두루뭉술한지 모른다.
 * - 입력 중에는 상한을 넘겨도 막지 않고 숫자만 붉게 둔다. 타이핑을 가로채면
 *   붙여넣기한 긴 글을 다듬을 수 없다. 실제 거절은 제출할 때 한 번 한다.
 * - **이 화면 안에서는 물어본 것을 전부 쌓아 보여준다.** 새로 물으면 이전 답이
 *   지워지던 것을 고쳤다 — `turns` 배열에 계속 추가하고, 스트리밍은 그중 마지막
 *   한 건만 진행 중 표시를 켠다. 페이지를 벗어나면 이 배열은 사라지는데, 그건
 *   `/me`의 질문 기록(서버에 이미 쌓인 `ask_history`)에서 다시 볼 수 있다.
 *
 * [Usage]
 * ```tsx
 * <AskPanel plots={plots} quota={quota} suggestions={suggestions} />
 * ```
 * ---------------------------------------------
 */

export interface AskPlotOption {
  id: string;
  labelKo: string;
}

interface AskPanelProps {
  plots: readonly AskPlotOption[];
  /** 서버가 페이지를 그릴 때 읽은 잔여 횟수. 못 읽었으면 null — 숫자를 지어내지 않는다. */
  quota: AskQuotaWire | null;
  suggestions: readonly string[];
  /** 추천 질문이 어느 작물·단계에서 나왔는지. 밭을 안 골랐으면 null. */
  suggestionBasisKo: string | null;
}

/** 질문 하나와 그 답변의 진행 상태. 화면에는 이게 쌓인 목록으로 보인다. */
interface AskTurn {
  id: string;
  question: string;
  answer: string;
  matches: AskMatch[];
  historyId: string | null;
  notice: string | null;
  streaming: boolean;
}

export function AskPanel({
  plots,
  quota: initialQuota,
  suggestions,
  suggestionBasisKo,
}: AskPanelProps) {
  const [question, setQuestion] = useState("");
  const [plotId, setPlotId] = useState<string>(plots[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<AskTurn[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [quota, setQuota] = useState<AskQuotaWire | null>(initialQuota);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  /** busy state는 비동기로 반영돼 Enter 연타·키 반복 사이에 두 번째 send()가
   * 끼어들 수 있다. ref는 즉시 반영되므로 그 틈을 막는다. */
  const sendingRef = useRef(false);

  const overLimit = question.trim().length > QUESTION_MAX_LENGTH;
  const exhausted = quota !== null && quota.remaining <= 0;

  async function send(raw: string) {
    if (sendingRef.current) return;

    const parsed = parseQuestion(raw);
    if (!parsed.ok) {
      setFormError(parsed.error);
      return;
    }

    sendingRef.current = true;
    setBusy(true);
    setFormError(null);
    setQuestion("");

    const turnId = crypto.randomUUID();
    setTurns((prev) => [
      ...prev,
      {
        id: turnId,
        question: parsed.value,
        answer: "",
        matches: [],
        historyId: null,
        notice: null,
        streaming: true,
      },
    ]);

    const patchTurn = (patch: Partial<AskTurn>) =>
      setTurns((prev) =>
        prev.map((turn) => (turn.id === turnId ? { ...turn, ...patch } : turn)),
      );
    const appendToken = (text: string) =>
      setTurns((prev) =>
        prev.map((turn) =>
          turn.id === turnId ? { ...turn, answer: turn.answer + text } : turn,
        ),
      );

    try {
      const response = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: parsed.value,
          plotId: plotId || null,
        }),
      });

      // 근거를 못 찾았거나 막힌 질문이면 JSON 한 덩어리로 온다.
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("text/event-stream")) {
        await applyJson(response, patchTurn);
        return;
      }

      await readStream(response, patchTurn, appendToken);
    } catch {
      // 네트워크가 끊겼거나 탭이 닫히는 중이다. 어느 쪽이든 할 일은 같다.
      patchTurn({
        notice: "답변을 받지 못했습니다. 연결을 확인하고 다시 시도해 주세요.",
      });
    } finally {
      patchTurn({ streaming: false });
      sendingRef.current = false;
      setBusy(false);
    }
  }

  async function applyJson(
    response: Response,
    patchTurn: (patch: Partial<AskTurn>) => void,
  ) {
    const data = (await response.json().catch(() => null)) as {
      message?: string;
      error?: string;
      history_id?: string;
      quota?: AskQuotaWire;
    } | null;

    if (data?.quota) setQuota(data.quota);

    patchTurn({
      historyId: data?.history_id ?? null,
      notice:
        data?.message ??
        data?.error ??
        // matches 가 비어 있을 때 ai-service 는 message 없이 온다. 지어내지 말고
        // "자료에 없다"고 말한다 — 이 답이 근거 없이 나오지 않았다는 뜻이다.
        "가지고 있는 자료에서 근거를 찾지 못했습니다. 조금 더 구체적으로 물어봐 주세요.",
    });
  }

  async function readStream(
    response: Response,
    patchTurn: (patch: Partial<AskTurn>) => void,
    appendToken: (text: string) => void,
  ) {
    const body = response.body;
    if (!body) {
      patchTurn({ notice: "답변을 받지 못했습니다. 잠시 뒤 다시 시도해 주세요." });
      return;
    }

    const reader = body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += value;
      const { events, rest } = splitSseEvents(buffer);
      buffer = rest;

      for (const frame of events) {
        const event = parseAskEvent(frame);
        if (!event) continue;

        if (event.kind === "meta") {
          patchTurn({ historyId: event.historyId });
          if (event.quota) setQuota(event.quota);
        } else if (event.kind === "matches") {
          patchTurn({ matches: event.matches });
        } else if (event.kind === "token") {
          appendToken(event.text);
        } else if (event.kind === "error") {
          patchTurn({ notice: event.messageKo });
        }
      }
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || exhausted) return;
    void send(question);
  }

  return (
    <div className="flex flex-col gap-6">
      <form className="flex flex-col gap-3" onSubmit={onSubmit}>
        {plots.length > 0 && (
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-fg-muted">어느 밭 이야기인가요?</span>
            <select
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-fg text-sm"
              disabled={busy}
              onChange={(event) => setPlotId(event.target.value)}
              value={plotId}
            >
              {plots.map((plot) => (
                <option key={plot.id} value={plot.id}>
                  {plot.labelKo}
                </option>
              ))}
              <option value="">밭과 무관한 질문</option>
            </select>
          </label>
        )}

        <div className="rounded-xl border border-border bg-surface focus-within:border-accent">
          <textarea
            aria-label="질문"
            className="min-h-28 w-full resize-y bg-transparent px-4 py-3 text-fg outline-none placeholder:text-fg-subtle"
            disabled={busy || exhausted}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              // Shift+Enter 는 줄바꿈으로 남긴다 — 여러 줄로 질문을 다듬는 경우가 있다.
              if (event.key !== "Enter" || event.shiftKey) return;
              event.preventDefault();
              if (busy || exhausted || question.trim().length === 0) return;
              void send(question);
            }}
            placeholder={
              exhausted
                ? "오늘 질문 가능 횟수를 모두 사용했습니다."
                : "예) 배추 잎에 구멍이 났는데 어떻게 해야 하나요?"
            }
            ref={inputRef}
            value={question}
          />
          <div className="flex flex-wrap items-center gap-3 border-border border-t px-4 py-2">
            <span
              className={`font-mono text-xs tabular-nums ${
                overLimit ? "text-unsuitable" : "text-fg-subtle"
              }`}
            >
              {question.trim().length} / {QUESTION_MAX_LENGTH}
            </span>
            {quota !== null && (
              // ponytail: 무료 체험 기간 동안 잔여 횟수 대신 안내 문구만 보여준다.
              // 한도를 다시 걸 때는 위 숫자 표시로 되돌리면 됨(quota.remaining/limit).
              <span className="text-fg-muted text-xs">
                한동안 무료 체험이 가능합니다
              </span>
            )}
            {/* Button 은 className 을 받지 않는다(스타일 단일 출처). 배치는 감싼 쪽이 한다. */}
            <div className="ml-auto">
              <Button
                disabled={busy || exhausted || question.trim().length === 0}
                loading={busy}
                size="sm"
                type="submit"
              >
                물어보기
              </Button>
            </div>
          </div>
        </div>

        {formError !== null && (
          <p className="text-unsuitable text-xs">{formError}</p>
        )}

        {plotId === "" && plots.length > 0 && (
          // 밭을 안 고르면 일반론이 된다. 그 사실을 적지 않으면 사용자는 왜
          // 답이 두루뭉술한지 모른 채 서비스를 탓한다.
          <p className="text-fg-subtle text-xs">
            밭을 고르면 그 밭의 작물·생육단계·최근 기상을 함께 보고 답합니다.
          </p>
        )}
      </form>

      {turns.length === 0 && (
        <AskSuggestionChips
          basisKo={suggestionBasisKo}
          onPick={(picked) => {
            setQuestion(picked);
            inputRef.current?.focus();
          }}
          questions={suggestions}
        />
      )}

      {exhausted && (
        <p className="rounded-lg border border-caution/25 bg-caution/5 px-4 py-3 text-fg text-sm leading-relaxed">
          오늘 질문 가능 횟수를 모두 사용했습니다. 내일 다시 이용하실 수
          있습니다.
        </p>
      )}

      {turns.length > 0 && (
        <section className="flex flex-col gap-8">
          {/* 최신 질문이 위로 오게 뒤집어 보여준다. push는 그대로 뒤에 붙인다 —
              turnId로 patch하는 로직이 순서에 기대지 않게 하기 위해서다. */}
          {[...turns].reverse().map((turn) => (
            <div className="flex flex-col gap-4" key={turn.id}>
              <div className="flex flex-wrap items-start gap-2">
                <Badge size="sm" tone="neutral">
                  내 질문
                </Badge>
                <p className="min-w-0 flex-1 whitespace-pre-wrap text-fg text-sm leading-relaxed">
                  {turn.question}
                </p>
              </div>

              <AskAnswer
                answer={turn.answer}
                historyId={turn.historyId}
                matches={turn.matches}
                noticeKo={turn.notice}
                streaming={turn.streaming}
              />
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
