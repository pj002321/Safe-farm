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
