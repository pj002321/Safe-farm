"""질문이 무엇을 묻고 있나. DB 없이 순수 함수만 본다.

★ 이 판정이 없으면 위성·병해충·재해가 **모든 질문에** 따라붙는다.
  "웃거름 언제 줘요?" 에 병해충 목록이 붙으면 LLM 이 그걸 답에 녹이려다
  정작 물어본 것이 흐려진다. 토큰도 그만큼 든다.
"""

from app.domain.ask_topics import topics_in


def test_안_물어본_질문에는_아무것도_안_붙는다():
    for 질문 in ("웃거름 언제 줘요?", "물은 얼마나 줘요", "수확은 언제 해요?"):
        assert topics_in(질문) == frozenset(), 질문


def test_생육을_물으면_위성이_붙는다():
    for 질문 in ("우리 밭 잘 크고 있나요?", "생육이 어때요", "잎이 누렇게 변했어요"):
        assert "satellite" in topics_in(질문), 질문


def test_벌레를_물으면_병해충이_붙는다():
    for 질문 in ("요즘 벌레가 많아요", "진딧물 어떻게 잡아요", "방제 언제 해요"):
        assert "pest" in topics_in(질문), 질문


def test_재해를_물으면_대비가_붙는다():
    for 질문 in ("태풍 오면 뭘 해야 하나요", "서리 내리면 어쩌죠", "가뭄이 걱정돼요"):
        assert "disaster" in topics_in(질문), 질문


def test_한_질문이_여러_갈래에_걸릴_수_있다():
    갈래 = topics_in("태풍 뒤에 벌레가 많아졌어요")
    assert "disaster" in 갈래
    assert "pest" in 갈래


def test_질문이_없으면_빈_집합():
    """못 알아들었으면 아무것도 안 붙인다 — 지금까지와 같은 답이 나간다."""
    assert topics_in(None) == frozenset()
    assert topics_in("") == frozenset()


def test_짧은_낱말로_잡지_않는다():
    """'잎' 하나로 잡으면 "잎채소 심어도 되나요" 가 위성 질문이 된다."""
    assert "satellite" not in topics_in("잎채소 심어도 되나요")


def test_한_글자_낱말이_엉뚱한_데_안_걸린다():
    """★ '얼' 을 넣었다가 "물은 얼마나 줘요" 가 재해 질문이 됐다(2026-09-19).

    한 글자는 어디에나 들어간다. 활용형까지 적어 길이를 늘린다.
    """
    assert topics_in("물은 얼마나 줘요") == frozenset()
    assert "disaster" in topics_in("밤에 얼까 봐 걱정돼요")
