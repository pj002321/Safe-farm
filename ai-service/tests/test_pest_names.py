"""병해충 이름 추리기. DB 없이 순수 변환만 본다.

★ 왜 필요한가 (2026-09-19 실측 · 고추 9월 중순 자료)

    바이러스‧역병‧탄저병 · 바이러스병·역병·탄저병 · 역병·탄저병·바이러스
    고추 담배나방 · 담배나방, 파밤나방

  그대로 카드에 실으면 같은 말이 다섯 번 나온다.
"""

from app.domain.pest_names import MAX_NAMES, merge_pest_names


def test_가운뎃점_표기가_제각각이어도_같은_것으로_묶는다():
    묶음 = merge_pest_names(
        ["바이러스‧역병‧탄저병", "바이러스병·역병·탄저병", "역병·탄저병·바이러스"]
    )
    assert "역병" in 묶음
    assert "탄저병" in 묶음
    # 세 줄이 세 이름으로 줄었다 — 아홉이 아니다
    assert len(묶음) <= MAX_NAMES


def test_짧은_쪽을_남긴다():
    """카드 제목에 이미 작물 이름이 있어 '고추 담배나방' 은 되풀이가 된다."""
    assert merge_pest_names(["고추 담배나방", "담배나방"]) == ("담배나방",)
    assert merge_pest_names(["담배나방", "고추 담배나방"]) == ("담배나방",)


def test_들어온_순서를_지킨다():
    assert merge_pest_names(["응애류", "노린재류"]) == ("응애류", "노린재류")


def test_너무_많으면_자른다():
    """무엇을 살펴야 하는지가 아니라 '많구나' 만 남으면 안 읽는다."""
    많음 = merge_pest_names([f"병{i}" for i in range(10)])
    assert len(많음) == MAX_NAMES


def test_빈_것은_빈_채로():
    assert merge_pest_names([]) == ()
    assert merge_pest_names(["", "  ", ","]) == ()


def test_이름을_고쳐_쓰지_않는다():
    """병해충 이름은 우리가 다듬을 것이 아니다 — 자료에 있는 말을 그대로 옮긴다."""
    assert merge_pest_names(["반쪽시들음병"]) == ("반쪽시들음병",)


def test_작물_이름이_병해충으로_새지_않는다():
    """★ 가운뎃점이 병해충도 잇고 작물도 잇는다.

    '무·배추 무름병' 은 "무와 배추의 무름병" 인데 쪼개면 '무' 가 병해충이 되고,
    '고랭지 무·배추 무름병' 은 '고랭지 무' 를 만든다(둘 다 실측).
    끝 낱말이 한 글자면 작물이 샌 것으로 본다.
    """
    assert merge_pest_names(["무·배추 무름병·뿌리혹병"]) == ("배추 무름병", "뿌리혹병")
    assert merge_pest_names(["고랭지 무·배추 무름병"]) == ("배추 무름병",)


def test_멀쩡한_이름은_안_버린다():
    """끝 낱말이 두 글자를 넘으면 그대로 둔다."""
    assert merge_pest_names(["벼멸구"]) == ("벼멸구",)
    assert merge_pest_names(["응애류·노린재류"]) == ("응애류", "노린재류")
