from app.knowledge.reranker import rerank
from app.models.chunk import Chunk


def test_rerank_keeps_order_when_no_overlap_difference():
    matches = [(Chunk(body="토마토 재배"), 0.1), (Chunk(body="상추 재배"), 0.2)]
    assert [d for _, d in rerank("배추 물주기", matches)] == [0.1, 0.2]


def test_rerank_breaks_tie_by_word_overlap():
    close = [(Chunk(body="상추 발아기 물주기 방법"), 0.20), (Chunk(body="토마토 병해충 예방"), 0.19)]
    result = rerank("상추 발아기 물주기", close)
    assert [c.body for c, _ in result] == ["상추 발아기 물주기 방법", "토마토 병해충 예방"]


def test_rerank_does_not_flip_when_distance_gap_exceeds_overlap_weight():
    far = [(Chunk(body="토마토 병해충 예방"), 0.10), (Chunk(body="상추 발아기 물주기 방법"), 0.90)]
    result = rerank("상추 발아기 물주기", far)
    assert [c.body for c, _ in result] == ["토마토 병해충 예방", "상추 발아기 물주기 방법"]


def test_rerank_does_not_mutate_distance_values():
    matches = [(Chunk(body="상추 발아기 물주기"), 0.20)]
    _, dist = rerank("상추 발아기 물주기", matches)[0]
    assert dist == 0.20
