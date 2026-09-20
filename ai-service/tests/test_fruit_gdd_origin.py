"""과수는 **그 해의 기점**에서 GDD 를 0으로 되감는다(`교안_과수를_살린다.md`).

★ 이 파일이 지키는 것은 넷이다.

    ① 과수는 심은 날이 아니라 그 해 기점부터 쌓는다
       나무는 몇 해 전에 심었다. 파종일부터 쌓으면 여러 해치 열이 누적돼
       5년 된 사과가 첫해에 gdd_target 을 넘어 영영 '수확' 에 머문다
    ② 기점은 창의 **중앙일**이다
       crop-data 가 gdd_target 을 만들 때 쓴 기준일과 같아야 분자와 분모의
       기준이 맞는다(`build._작형_일정` 의 `파종일`)
    ③ 올해 기점이 아직 안 왔으면 **작년 기점**부터다
       수확이 늦은 과수(감귤 12월)가 해를 넘겨도 끊기지 않아야 한다
    ④ 한해살이는 하나도 안 바뀐다

⚠ **같은 규칙이 웹에도 있다** — `src/features/cultivations/domain/growthGauge.ts`.
  언어가 달라 두 벌로 적되 **같아야 한다.** 한쪽만 고치면 화면의 '개화기' 와
  LLM 이 말하는 '개화기' 가 갈린다(`growthGauge.ts` 머리말).
"""

from datetime import date
from types import SimpleNamespace

import pytest

from app.service import plot_growth
from app.service.plot_growth import _과수기점일, _중앙일, is_fruit


def 품종(sow_method, sow_from, sow_to):
    return SimpleNamespace(sow_method=sow_method, sow_from=sow_from, sow_to=sow_to)


# ── is_fruit — 과수 표식 ──────────────────────────────────────────


@pytest.mark.parametrize("말", ["발아", "개화"])
def test_기점_낱말이면_과수다(말):
    assert is_fruit(말) is True


@pytest.mark.parametrize("말", ["씨뿌림", "아주심기", "모기르기", "인공수분", "", None])
def test_심는_말이면_과수가_아니다(말):
    # ⚠ '인공수분'(참다래의 옛 값)도 과수가 아니다 — 기점 낱말만 본다
    assert is_fruit(말) is False


@pytest.mark.parametrize("말", [" 발아", "개화 ", "  발아  ", "\t개화\n"])
def test_앞뒤_공백은_벗긴다(말):
    """⚠ 웹의 `fruitOrigin.isFruit` 가 `.trim()` 을 한다. 여기서 안 벗기면
    `" 개화 "` 에서 **화면은 과수로 보고 서버는 아니라고 본다** — 게이지와 할 일
    카드가 서로 다른 기준으로 돌게 된다."""
    assert is_fruit(말) is True


# ── _중앙일 — 창의 가운데 ─────────────────────────────────────────


def test_창의_가운데를_쓴다():
    # 사과 03-15~04-05. crop-data 의 기준일과 같아야 한다 (②)
    assert _중앙일("03-15", "04-05") == (3, 25)
    assert _중앙일("04-05", "04-15") == (4, 10)


def test_한쪽만_있으면_그쪽을_쓴다():
    assert _중앙일("03-15", None) == (3, 15)
    assert _중앙일(None, "04-05") == (4, 5)


def test_창이_비면_없다():
    assert _중앙일(None, None) is None
    assert _중앙일("", "") is None


@pytest.mark.parametrize(
    ("창", "기대"),
    [
        (("13-01", "13-05"), None),   # 달에 13월이 없다
        (("04-32", "04-33"), None),   # 4월에 32일이 없다
        (("02-30", "03-05"), (3, 5)),  # 한쪽만 버리고 남은 쪽을 쓴다
        (("02-29", "03-05"), (3, 2)),  # 윤년은 받는다 (2000 으로 검사한다)
    ],
)
def test_달력에_없는_날은_버린다(창, 기대):
    """⚠ **이 검사가 배치를 지킨다.**

    범위 검사(1~12 · 1~31)만 하면 `02-30` 이 새어 나가고, 그 값으로 `date()` 를
    부르면 **`ValueError` 가 그대로 올라가 자정 배치가 통째로 죽는다.**
    `repo/crop.py` 가 적어 둔 사고와 같은 꼴이다 — "밭 하나의 결손이 모든
    사용자의 할 일을 막았다".
    """
    assert _중앙일(*창) == 기대


def test_해를_넘는_창도_가운데를_낸다():
    # 지금 과수엔 없지만 막아 둔다. 12-25~01-05 의 가운데는 12-30 이다
    assert _중앙일("12-25", "01-05") == (12, 30)


# ── _과수기점일 — 올해냐 작년이냐 ─────────────────────────────────


def test_기점이_지났으면_올해다():
    v = 품종("발아", "03-15", "04-05")
    assert _과수기점일(v, date(2026, 9, 20)) == date(2026, 3, 25)


def test_기점이_아직이면_작년이다():
    # ③ 1~3월. 감귤은 12월까지 따므로 작년 기점부터 이어져야 한다
    v = 품종("발아", "03-15", "04-05")
    assert _과수기점일(v, date(2026, 1, 10)) == date(2025, 3, 25)


def test_기점_당일이면_올해다():
    v = 품종("발아", "03-15", "04-05")
    assert _과수기점일(v, date(2026, 3, 25)) == date(2026, 3, 25)


def test_창이_없으면_기점도_없다():
    assert _과수기점일(품종("발아", None, None), date(2026, 9, 20)) is None


# ── 해가 바뀌면 다시 0 부터 ───────────────────────────────────


def test_기점_하루_전까지는_작년_기점이다():
    """★ **과수는 선이 아니라 원이다.** 이 검사가 그 이음매를 지킨다.

    1월에 감귤을 따는 사람이 있다. 그때 올해 기점(3월)은 아직 안 왔으므로
    **작년 기점부터 이어서** 세야 딸 때가 맞는다. 여기가 어긋나면 한겨울에
    누적이 0 으로 떨어져 게이지가 처음으로 되감긴다.
    """
    사과 = 품종("발아", "03-15", "04-05")
    assert _과수기점일(사과, date(2027, 3, 24)) == date(2026, 3, 25)
    assert _과수기점일(사과, date(2027, 1, 10)) == date(2026, 3, 25)


def test_기점_당일에_다음_바퀴가_시작된다():
    """🔴 **여기서 누적이 0 으로 돌아간다.**

    `gdd_origin` 이 과수에 늘 `0.0` 을 주므로, 시작일이 하루 만에 한 해를 건너뛰면
    쌓을 구간이 0일이 되어 **누적도 0** 이 된다. 따로 지우는 코드가 없는 까닭이다.
    """
    사과 = 품종("발아", "03-15", "04-05")
    assert _과수기점일(사과, date(2027, 3, 24)) == date(2026, 3, 25)   # 아직 작년 바퀴
    assert _과수기점일(사과, date(2027, 3, 25)) == date(2027, 3, 25)   # ← 새 바퀴, 0일치
    assert _과수기점일(사과, date(2027, 3, 26)) == date(2027, 3, 25)


def test_개화_기점도_해마다_되감긴다():
    """⚠ **발아만 되감기면 안 된다.** 기점 낱말은 둘이다(발아 23품종 · 개화 4품종).

    매실은 발아 자료가 없어 개화를 기점으로 쓴다. 이 갈래가 빠지면 그 넷만
    영영 심은 날부터 세게 된다.
    """
    매실 = 품종("개화", "03-05", "04-05")
    assert _과수기점일(매실, date(2027, 3, 19)) == date(2026, 3, 20)
    assert _과수기점일(매실, date(2027, 3, 20)) == date(2027, 3, 20)


def test_바퀴가_여러_해_돌아도_기점은_같은_날이다():
    """해가 바뀌어도 월·일은 그대로여야 한다 — 창이 안 바뀌기 때문이다."""
    사과 = 품종("발아", "03-15", "04-05")
    for 해 in (2026, 2027, 2028, 2029):
        assert _과수기점일(사과, date(해, 9, 20)) == date(해, 3, 25)


def test_윤년에도_기점이_안_밀린다():
    """⚠ 2028 은 윤년이다. 2월을 지나 3월에 세는 날은 윤일에 안 밀린다."""
    사과 = 품종("발아", "03-15", "04-05")
    assert _과수기점일(사과, date(2028, 3, 25)) == date(2028, 3, 25)
    # 2월이 기점인 과수(무화과)는 윤년 당일도 받아야 한다
    무화과 = 품종("발아", "02-15", "02-25")
    assert _과수기점일(무화과, date(2028, 2, 29)) == date(2028, 2, 20)


# ── gdd_origin — 셋이 같이 쓰는 규칙 ─────────────────────────────


def _원점(monkeypatch, *, sow_method, sow_from, sow_to, 심은날, 시작단계=None, 단계gdd=120.0):
    """`gdd_origin` 을 DB 없이 돌린다. 이 함수가 보는 것은 품종과 재배 건뿐이다."""
    monkeypatch.setattr(
        plot_growth, "variant_by_id", lambda _db, _vid: 품종(sow_method, sow_from, sow_to)
    )
    monkeypatch.setattr(
        plot_growth,
        "stage_by_order",
        lambda _db, _vid, _order: SimpleNamespace(gdd_from=단계gdd),
    )
    재배 = SimpleNamespace(variant_id=7, sowing_date=심은날, start_stage_order=시작단계)
    return plot_growth.gdd_origin(None, 재배)


def test_과수는_심은_해를_안_본다(monkeypatch):
    # ① 5년 전에 심었어도 올해 기점부터다
    시작일, 시작gdd, 과수 = _원점(
        monkeypatch, sow_method="발아", sow_from="03-15", sow_to="04-05",
        심은날=date(2021, 4, 1),
    )
    assert 과수 is True
    assert 시작일.year == date.today().year or 시작일.year == date.today().year - 1
    assert (시작일.month, 시작일.day) == (3, 25)
    assert 시작gdd == 0.0


def test_과수에는_모종_보정을_얹지_않는다(monkeypatch):
    # 해마다 0으로 되감기므로 건너뛸 앞 단계가 없다
    _, 시작gdd, _ = _원점(
        monkeypatch, sow_method="발아", sow_from="03-15", sow_to="04-05",
        심은날=date(2021, 4, 1), 시작단계=3, 단계gdd=500.0,
    )
    assert 시작gdd == 0.0


def test_한해살이는_파종일부터다(monkeypatch):
    # ④ 채소 쪽 동작이 하나도 안 바뀌어야 한다
    시작일, 시작gdd, 과수 = _원점(
        monkeypatch, sow_method="씨뿌림", sow_from="09-11", sow_to="11-30",
        심은날=date(2026, 8, 15),
    )
    assert 과수 is False
    assert 시작일 == date(2026, 8, 15)
    assert 시작gdd == 0.0


def test_한해살이의_모종_보정은_그대로_산다(monkeypatch):
    _, 시작gdd, _ = _원점(
        monkeypatch, sow_method="아주심기", sow_from="10-11", sow_to="11-20",
        심은날=date(2026, 8, 15), 시작단계=2, 단계gdd=161.0,
    )
    assert 시작gdd == 161.0


def test_창이_빈_과수는_옛_길로_떨어진다(monkeypatch):
    # 조용히 틀리는 것보다 낫다. 그 작물은 어차피 gdd_target 도 비어 게이지가 안 뜬다
    시작일, _, 과수 = _원점(
        monkeypatch, sow_method="발아", sow_from=None, sow_to=None,
        심은날=date(2021, 4, 1),
    )
    assert 과수 is True
    assert 시작일 == date(2021, 4, 1)


# ── 과수 수확 카드 — 단계 이름으로 가른다 ────────────────────────


@pytest.mark.parametrize(
    ("단계", "심는법", "기대"),
    [
        ("수확기", "발아", True),
        ("중생종수확", "발아", True),
        ("착색기·성숙기", "발아", True),
        ("성숙 착색", "개화", True),
        # 아직 자라는 중
        ("과실비대기", "발아", False),
        ("발아기", "발아", False),
        # ⚠ 괄호 안 설명의 '비대성숙' 이 '성숙' 에 걸리면 안 된다 (2026-09-21 실측)
        ("과실 2차 비대기 (재배환경에 따라 30~40% 비대성숙)", "발아", False),
        # ⚠ 체리의 '착과수확보' 는 수확이 아니다 (cropping.수확아님 과 같은 함정)
        ("착과수확보", "발아", False),
        # 한해살이는 이 길로 안 온다 — 밭이 비는지로 재는 옛 판정을 쓴다
        ("수확", "씨뿌림", False),
        ("수확", None, False),
    ],
)
def test_과수_수확_단계_판정(단계, 심는법, 기대):
    """⚠ **한해살이의 수확 판정을 과수에 쓸 수 없다.**

    `harvest_clears_field` 는 거짓이고(나무는 거둬도 밭에 남는다) `crop_is_standing`
    은 늘 참이다(잎이 그대로라 거둔 뒤를 못 가른다). 그래서 **단계 이름**으로 가른다.

    ⚠ `gdd_target_passed` 를 안 쓰는 까닭 — 감귤은 수확기가 7주인데 목표를 첫날에
      다 채운다. 그걸로 내면 45일 내내 같은 카드가 뜬다.
    """
    from app.domain.task_rules import 과수수확중

    assert (
        과수수확중(
            SimpleNamespace(
                sow_method=심는법, stage_name=단계, years_since_planting=5
            )
        )
        is 기대
    )


@pytest.mark.parametrize(
    ("년차", "기대"),
    [
        (1, False),     # 🔴 심은 해에는 열매가 안 달린다
        (2, True),
        (5, True),
        (None, True),   # 모르면 막지 않는다 — 한해살이 경로와 같은 태도
    ],
)
def test_1년차_묘목에는_수확_카드를_안_낸다(년차, 기대):
    """⚠ 사흘 전에 심은 단감 묘목이 `꽃눈분화기` 로 판정됐다(2026-09-21 실측).

    기점 되감기가 심기 5개월 전부터 열을 쌓아서다 — **그 계산 자체는 맞다**
    (옮겨 심어도 그해 생육은 이어진다). 다만 1년차에 수확 카드를 보내면 틀린 말이다.

    ⚠ 2년차 이후는 안 막는다. 작물별 결실 시작 나이가 마스터에 없어 지어내게 된다.
    """
    from app.domain.task_rules import 과수수확중

    assert (
        과수수확중(
            SimpleNamespace(
                sow_method="발아", stage_name="수확기", years_since_planting=년차
            )
        )
        is 기대
    )


# ── 농작업 문구 — 같은 갈래라도 과수는 다른 일이다 ───────────────


@pytest.mark.parametrize(
    ("갈래", "심는법", "제목에_들어갈_말"),
    [
        # crop-data 갈래는 한해살이 기준이라 과수에서 뜻이 어긋난다
        ("순지르기", "발아", "가지 치기"),      # 원본 '전정' 25건이 여기 묶인다
        ("순지르기", "씨뿌림", "순 지르기"),    # 채소는 그대로
        ("솎기", "발아", "봉지"),              # 원본 '봉지' 6건이 여기 묶인다
        ("솎기", "씨뿌림", "솎아 주기"),
        ("지주", "발아", "유인"),              # 원본 '유인' 11건
        ("지주", "씨뿌림", "지주 세우기"),
        # 과수 표에 없는 갈래는 공통 표로 떨어진다
        ("김매기", "발아", "김매기"),
    ],
)
def test_과수는_농작업_문구가_다르다(갈래, 심는법, 제목에_들어갈_말):
    """⚠ **갈래를 새로 파지 않고 말만 고른다.**

    crop-data 에 갈래를 더하면 CSV 계약이 바뀌고 재빌드·재시딩·재임베딩이 따라온다.
    `전정` 은 `순지르기` 갈래에, `봉지` 는 `솎기` 갈래에 이미 들어와 있다 —
    읽는 쪽에서 과수면 다른 문구를 낸다.
    """
    from app.domain.task_rules import PlotTaskInputs, _work_candidates

    cards = _work_candidates(
        PlotTaskInputs(
            crop_name_ko="사과",
            stage_name="성숙 착색",
            sow_method=심는법,
            stage_tasks=(갈래,),
        )
    )
    assert len(cards) == 1
    assert 제목에_들어갈_말 in cards[0].title


@pytest.mark.parametrize(
    ("심은날", "오늘", "기대"),
    [
        (date(2021, 4, 1), date(2026, 9, 20), 6),
        (date(2026, 1, 1), date(2026, 9, 20), 1),   # 심은 해면 1년차
        (date(2030, 1, 1), date(2026, 9, 20), None),  # 🔴 미래면 음수가 나왔다
    ],
)
def test_n년차는_음수가_안_나온다(심은날, 오늘, 기대):
    """⚠ 사용자가 미래 날짜를 넣을 수 있어 막을 수 있는 입력이 아니다.
    전에는 화면에 "-3년차" 가 찍혔다(2026-09-21 버그 헌팅).
    웹 `fruitOrigin.yearsSincePlanting` 도 같은 검사를 한다."""
    from app.service.plot_growth import _n년차

    assert _n년차(심은날, 오늘) == 기대
