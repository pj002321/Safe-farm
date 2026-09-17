"""직전 대화를 프롬프트에 붙일 한 덩이 문장으로 만든다. (순수)

이력은 저장만 되고 프롬프트가 읽지 않아서, "그럼 물은 얼마나?" 같은 후속 질문이
매번 맥락 없이 처리됐다. 여기서 직전 몇 턴을 문장으로 옮겨 질문 앞에 붙인다.

⚠️ **세션 키가 없다.** `ask_history` 에는 대화를 묶는 컬럼이 없어서, "직전 N턴"은
같은 사용자의 최근 N건으로 근사한다(`service/ask_history.recent_turns` 의 시간
창). 어제 물어본 것이 오늘 질문에 섞이는 걸 시간 창이 막는다. 세션 컬럼이
생기면 조회 조건만 바꾸면 되고 이 파일은 그대로다.

규칙은 두 가지를 두고 **한 줄로 갈아 끼운다**(`HISTORY_RULE`).

- `build_history_context_1` — 직전 N턴 원문. 대명사("그거", "얘")를 풀 수 있다.
  대신 토큰을 많이 먹고, 지난 답변이 틀렸으면 그 틀린 말이 다시 근거가 된다.
- `build_history_context_2` — 질문만 모은 한 줄. 토큰이 거의 안 들고 오염도 없다.
  대신 답변에 있던 구체값(품종·날짜)은 잃는다.
"""

from collections.abc import Callable, Sequence
from dataclasses import dataclass

#: 몇 턴까지 붙일지. 늘릴수록 대명사는 잘 풀리지만 근거 자료가 밀려난다.
HISTORY_TURNS = 3

#: 지난 답변에서 살릴 길이. 답변은 문단 단위라 통째로 넣으면 참고 자료보다 길어진다.
ANSWER_CLIP = 200


@dataclass(frozen=True)
class Turn:
    """지난 대화 한 턴. 답변이 None 인 건 스트리밍이 끊겼거나 가드레일에 막힌 건이다."""

    question: str
    answer: str | None


def build_history_context_1(
    turns: Sequence[Turn], max_turns: int = HISTORY_TURNS, clip: int = ANSWER_CLIP
) -> str | None:
    """
    # summary
    직전 턴을 오래된 것부터 원문으로 옮김. 답변은 앞부분만 자름.
    대명사로 이어지는 후속 질문을 풀 수 있는 건 이쪽뿐임.

    답변이 없는 턴은 질문만 남김 — 빈 "이전 답변:" 줄을 주면 모델이 답이 없었다는
    사실 자체를 맥락으로 읽음.

    # params
    turns: 지난 대화. **오래된 것이 앞**<br>
    max_turns: 뒤에서부터 몇 턴을 쓸지<br>
    clip: 답변에서 살릴 글자 수<br>

    # returns
    "이전 질문/이전 답변" 줄이 이어진 한 덩이. 쓸 턴이 없으면 None

    # examples
        build_history_context_1([Turn("상추 언제 심어?", "3월 말쯤...")])
        -> '이전 질문: 상추 언제 심어?\\n이전 답변: 3월 말쯤...'
    """
    recent = _recent(turns, max_turns)
    if not recent:
        return None

    lines: list[str] = []
    for turn in recent:
        lines.append(f"이전 질문: {turn.question.strip()}")
        if turn.answer and turn.answer.strip():
            lines.append(f"이전 답변: {_clip(turn.answer, clip)}")
    return "\n".join(lines)


def build_history_context_2(
    turns: Sequence[Turn], max_turns: int = HISTORY_TURNS, clip: int = ANSWER_CLIP
) -> str | None:
    """
    # summary
    무엇을 물어봤는지만 한 줄로. 답변은 버림 — 지난 답변이 틀렸을 때 그 말이 다시
    근거가 되는 걸 막고, 토큰도 거의 안 씀.

    `clip` 은 받지만 쓰지 않음. `HISTORY_RULE` 로 갈아 끼우려면 두 함수의 모양이
    같아야 해서 남겨 둠.

    # params
    turns: 지난 대화. **오래된 것이 앞**<br>
    max_turns: 뒤에서부터 몇 턴을 쓸지<br>
    clip: 안 씀. `build_history_context_1` 과 모양을 맞추려고 받음<br>

    # returns
    "앞서 A, B 를 물었다." 한 줄. 쓸 턴이 없으면 None

    # examples
        build_history_context_2([Turn("상추 언제 심어?", None)])
        -> '앞서 "상추 언제 심어?" 를 물었다.'
    """
    del clip  # 모양만 맞춤
    recent = _recent(turns, max_turns)
    questions = [turn.question.strip() for turn in recent if turn.question.strip()]
    if not questions:
        return None
    joined = ", ".join(f'"{q}"' for q in questions)
    return f"앞서 {joined} 를 물었다."


#: 두 규칙이 공유하는 모양. 부르는 쪽은 어느 쪽인지 몰라도 된다.
HistoryRule = Callable[[Sequence[Turn]], str | None]

#: 지금 쓰는 규칙. 바꾸려면 이 줄만 고친다.
#: 후속 질문이 대명사로 이어지는 일이 잦아 원문 쪽을 기본으로 둔다.
HISTORY_RULE: HistoryRule = build_history_context_1


def _recent(turns: Sequence[Turn], max_turns: int) -> list[Turn]:
    """뒤에서 max_turns 개. 0 이하면 빈 리스트 — 음수 슬라이스로 전부 딸려오지 않게 막는다."""
    if max_turns <= 0:
        return []
    return list(turns)[-max_turns:]


def _clip(text: str, limit: int) -> str:
    """limit 을 넘으면 잘라 내고 말줄임표. 자른 티를 남겨야 모델이 뒤가 더 있다고 읽는다."""
    cleaned = " ".join(text.split())
    return cleaned if len(cleaned) <= limit else f"{cleaned[:limit]}…"
