"""근거 글자 예산. 프롬프트에 들어가는 본문 길이를 상한으로 막는다.

근거는 matches(top-5) 뒤에 같은 문서의 앞뒤 조각(neighbors)이 붙어 본문이 1.8배로
는다(`knowledge/vector_store.neighbors`). 상한이 없으면 긴 문서가 걸린 질문 하나가
다른 질문의 열 배를 쓰고, 그게 요금과 첫 글자까지의 시간에 그대로 나타난다.

여기서 지키는 것은 "얼마나 자르나"가 아니라 **무엇을 남기나**다 — 앞에서부터
남기고 뒤에서 버린다. 순서가 곧 중요도라서 반대로 자르면 1위 근거가 빠진다.
"""

from types import SimpleNamespace

from app.knowledge.generator import build_context


def _match(body, title="제목", source="crop_guide", meta=None):
    document = SimpleNamespace(title=title, source=source, meta=meta or {})
    return (SimpleNamespace(body=body, document=document), 0.1)


def test_everything_fits_when_under_budget():
    matches = [_match("가" * 50), _match("나" * 50)]

    context = build_context(matches, budget=10_000)

    assert "가" * 50 in context
    assert "나" * 50 in context


def test_tail_is_dropped_first():
    """뒤가 neighbors 자리다. 넘치면 그쪽을 먼저 포기한다."""
    matches = [_match("가" * 300), _match("나" * 300), _match("다" * 300)]

    context = build_context(matches, budget=700)

    assert "가" * 300 in context
    assert "다" * 300 not in context


def test_first_block_survives_even_if_it_alone_exceeds():
    """근거 0건은 '검색 실패' 의 뜻이다. 예산 때문에 그 상태를 만들지 않는다."""
    matches = [_match("가" * 5_000)]

    context = build_context(matches, budget=100)

    assert "가" * 5_000 in context


def test_zero_budget_means_no_limit():
    """예전 동작으로 되돌릴 수 있어야 한다 — 상한이 답을 망쳤는지 비교하려면 필요하다."""
    matches = [_match("가" * 300), _match("나" * 300)]

    context = build_context(matches, budget=0)

    assert "나" * 300 in context


def test_reference_values_stay_with_their_own_block():
    """자르는 코드가 블록 경계를 지키는지. 본문과 참고값이 갈리면 LLM 이 다른
    문서의 숫자를 이 제목에 갖다 붙인다(generator.build_context 의 ⚠ 참고)."""
    matches = [_match("가" * 100, title="상추", meta={"base_temp": 4.0})]

    context = build_context(matches, budget=10_000)

    assert context.index("[작물 재배 가이드 · 상추]") < context.index("참고값: base_temp=4.0")
