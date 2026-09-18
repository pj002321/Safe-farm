from app.domain.diversity import diversify


def test_상한을_넘은_것은_뒤로_간다_버려지지_않는다():
    got = diversify(["a", "a", "a", "b", "c"], key=str, per_key=2, limit=8)
    assert got == ["a", "a", "b", "c", "a"]


def test_앞부분과_뒷부분_모두_원래_순서():
    got = diversify(["a", "b", "a", "a", "c", "a"], key=str, per_key=2, limit=8)
    assert got == ["a", "b", "a", "c", "a", "a"]


def test_한_소스뿐이면_그대로_돌아온다():
    # 첫 판이 이 경우를 2개로 줄여 근거가 쪼그라들었다 — 밀어내기는 개수를 안 줄인다
    got = diversify(["a"] * 5, key=str, per_key=2, limit=5)
    assert got == ["a"] * 5


def test_limit_에서_자른다():
    assert len(diversify(list("abcdefghij"), key=str, per_key=2, limit=5)) == 5


def test_후보가_모자라면_있는_만큼():
    assert diversify(["a", "b"], key=str, per_key=2, limit=5) == ["a", "b"]
    assert diversify([], key=str) == []


def test_key_함수로_묶음을_고른다():
    # 실제 쓰임과 같은 모양 — (조각, 거리) 튜플에서 소스를 꺼낸다
    matches = [
        (("weekly_note", 1), 0.10),
        (("weekly_note", 2), 0.11),
        (("weekly_note", 3), 0.12),
        (("crop_guide", 4), 0.13),
    ]
    got = diversify(matches, key=lambda m: m[0][0], per_key=2, limit=5)
    assert [m[0][1] for m in got] == [1, 2, 4, 3]
