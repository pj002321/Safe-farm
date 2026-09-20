"""base_temp 가 비어 있는 작물에서 GDD 계산이 터지던 것.

운영에서 자정 배치가 통째로 죽었다. 남은 흔적:

    File "/app/app/service/plot_growth.py", line 193, in <genexpr>
      daily_gdd(float(o.temp_max), float(o.temp_min), float(crop.base_temp), upper)
    TypeError: float() argument must be a string or a real number, not 'NoneType'

바로 윗줄의 upper_temp 는 None 을 검사하는데 base_temp 는 안 했다. 그리고
base_temp 를 쓰는 곳이 셋이라(daily_gdd_series · crop_interpretation ·
compute_plot_growth) 호출부마다 막으면 다음에 또 빠뜨린다. 그래서 공통 조회가
"쓸 수 없는 작물"을 None 으로 걸러 낸다.

그 공통 조회는 2026-09-19 에 `plot_growth._crop_for_cultivation` 에서
`repo.crop.usable_crop_of_variant` 로 옮겼다. 검사 대상도 같이 옮긴다 —
가드가 사는 자리를 따라가지 않으면 이 테스트는 없어진 함수를 지키게 된다.

GDD 는 기준온도 없이는 정의되지 않으므로 답은 0 이나 추정값이 아니라
**판정 보류(None)** 다 — "근거를 못 만들면 카드를 만들지 않는다"는 스펙 규칙.
"""

from types import SimpleNamespace

from app.repo.crop import usable_crop_of_variant
from app.service import plot_growth


class _FakeScalars:
    def __init__(self, row):
        self._row = row

    def first(self):
        return self._row


class _FakeSession:
    """variant 조회 → crop 조회 순서로 미리 준비한 행을 돌려준다.

    `usable_crop_of_variant` 는 `db.scalars(stmt).first()` 를 두 번 부른다.
    실제 세션 없이 그 순서만 흉내 낸다 — 이 테스트가 지키는 것은 SQL 이 아니라
    "base_temp 가 비면 None 을 돌려준다"는 판정이다.

    `info` 는 요청 범위 캐시가 값을 놓는 자리다(`core/request_cache`). 진짜
    Session 에는 원래 있는 dict 라, 여기서도 세션마다 새로 만든다 — 공유하면
    테스트끼리 캐시가 새어 다음 테스트가 앞 테스트의 작물을 본다.
    """

    def __init__(self, variant, crop):
        self._rows = [variant, crop]
        self._i = 0
        self.info: dict = {}

    def scalars(self, _stmt):
        row = self._rows[self._i]
        self._i = min(self._i + 1, len(self._rows) - 1)
        return _FakeScalars(row)


VARIANT = SimpleNamespace(variant_id=1, crop_id=7)


def test_crop_without_base_temp_is_unusable():
    """이게 운영에서 배치를 죽인 행이다. 터지지 않고 None 이어야 한다."""
    crop = SimpleNamespace(name="배추", base_temp=None, upper_temp=30.0)

    assert usable_crop_of_variant(_FakeSession(VARIANT, crop), 1) is None


def test_crop_with_base_temp_passes_through():
    """정상 작물까지 막지 않았는지 — 고치면서 같이 죽이기 쉬운 자리다."""
    crop = SimpleNamespace(name="배추", base_temp=5.0, upper_temp=30.0)

    assert usable_crop_of_variant(_FakeSession(VARIANT, crop), 1) is crop


def test_missing_variant_is_unusable():
    """기존 동작(variant 없음 → None)을 유지하는지 같이 고정한다."""
    assert usable_crop_of_variant(_FakeSession(None, None), 1) is None


def test_all_three_callers_stop_on_unusable_crop():
    """세 호출부가 전부 `crop is None` 에서 멈추는지 확인한다.

    이 가드가 공통 지점에서 도는 근거다 — 셋 중 하나라도 None 을 안 보고
    진행하면 같은 TypeError 가 그쪽에서 다시 난다.

    ⚠ 2026-09-20 — `compute_plot_growth` 의 몸통이 `cultivation_growth` 로
      갈라졌다(교안 §2-B: 작업카드가 재배마다 돈다). 가드는 그쪽으로 따라갔고,
      대표를 고르는 쪽은 넘기기만 한다. **셋이라는 수는 그대로다.**
    """
    import inspect

    source = inspect.getsource(plot_growth)
    for fn in ("daily_gdd_series", "crop_interpretation", "cultivation_growth"):
        body = source.split(f"def {fn}(", 1)[1].split("\ndef ", 1)[0]
        assert "if crop is None:" in body, f"{fn} 이 crop is None 을 검사하지 않는다"


def test_lead_path_delegates_instead_of_copying_the_guard():
    """대표를 고르는 길이 가드를 **베끼지 않고 넘기는지**.

    베끼면 가드가 두 벌이 되어 한쪽만 고쳐진다 — 이 파일이 막으려는 사고가
    바로 그 종류다.
    """
    import inspect

    body = inspect.getsource(plot_growth.compute_plot_growth)
    assert "cultivation_growth(" in body, "대표 경로가 공통 함수를 안 부른다"
    assert "if crop is None:" not in body, "가드가 두 벌이 됐다"
