"""base_temp 가 비어 있는 작물에서 GDD 계산이 터지던 것.

운영에서 자정 배치가 통째로 죽었다. 남은 흔적:

    File "/app/app/service/plot_growth.py", line 193, in <genexpr>
      daily_gdd(float(o.temp_max), float(o.temp_min), float(crop.base_temp), upper)
    TypeError: float() argument must be a string or a real number, not 'NoneType'

바로 윗줄의 upper_temp 는 None 을 검사하는데 base_temp 는 안 했다. 그리고
base_temp 를 쓰는 곳이 셋이라(daily_gdd_series · crop_interpretation ·
compute_plot_growth) 호출부마다 막으면 다음에 또 빠뜨린다. 그래서 공통 조회인
`_crop_for_cultivation` 이 "쓸 수 없는 작물"을 None 으로 걸러 낸다.

GDD 는 기준온도 없이는 정의되지 않으므로 답은 0 이나 추정값이 아니라
**판정 보류(None)** 다 — "근거를 못 만들면 카드를 만들지 않는다"는 스펙 규칙.
"""

from types import SimpleNamespace

from app.service import plot_growth


class _FakeQuery:
    def __init__(self, row):
        self._row = row

    def filter(self, *_args, **_kwargs):
        return self

    def first(self):
        return self._row


class _FakeSession:
    """variant 조회 → crop 조회 순서로 미리 준비한 행을 돌려준다."""

    def __init__(self, variant, crop):
        self._rows = [variant, crop]
        self._i = 0

    def query(self, _model):
        row = self._rows[self._i]
        self._i = min(self._i + 1, len(self._rows) - 1)
        return _FakeQuery(row)


VARIANT = SimpleNamespace(variant_id=1, crop_id=7)
CULTIVATION = SimpleNamespace(variant_id=1)


def test_crop_without_base_temp_is_unusable():
    """이게 운영에서 배치를 죽인 행이다. 터지지 않고 None 이어야 한다."""
    crop = SimpleNamespace(name="배추", base_temp=None, upper_temp=30.0)

    result = plot_growth._crop_for_cultivation(
        _FakeSession(VARIANT, crop), CULTIVATION
    )

    assert result is None


def test_crop_with_base_temp_passes_through():
    """정상 작물까지 막지 않았는지 — 고치면서 같이 죽이기 쉬운 자리다."""
    crop = SimpleNamespace(name="배추", base_temp=5.0, upper_temp=30.0)

    result = plot_growth._crop_for_cultivation(
        _FakeSession(VARIANT, crop), CULTIVATION
    )

    assert result is crop


def test_missing_variant_is_unusable():
    """기존 동작(variant 없음 → None)을 유지하는지 같이 고정한다."""
    result = plot_growth._crop_for_cultivation(
        _FakeSession(None, None), CULTIVATION
    )

    assert result is None


def test_all_three_callers_stop_on_unusable_crop():
    """세 호출부가 전부 `crop is None` 에서 멈추는지 확인한다.

    이 가드가 공통 지점에서 도는 근거다 — 셋 중 하나라도 None 을 안 보고
    진행하면 같은 TypeError 가 그쪽에서 다시 난다.
    """
    import inspect

    source = inspect.getsource(plot_growth)
    for fn in ("daily_gdd_series", "crop_interpretation", "compute_plot_growth"):
        body = source.split(f"def {fn}(", 1)[1].split("\ndef ", 1)[0]
        assert "if crop is None:" in body, f"{fn} 이 crop is None 을 검사하지 않는다"
