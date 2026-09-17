"""만료 경계 테스트.

이 파일의 전부는 **날짜 경계**다. 같은 축에서 한 번 데인 적이 있다 — 크론은 정각에
도는데 생성 시각은 몇 분 뒤라, 순간끼리 빼면 매번 하루씩 밀렸다.

그리고 이 경계는 **Next 쪽 CARRY_OVER_DAYS 와 같은 값이어야 한다.** 어긋나면
화면에서 사라진 카드가 생성을 계속 막거나(원래 고치려던 문제), 화면에 남아 있는
카드 옆에 같은 제목이 하나 더 뜬다.
"""

from datetime import datetime, timedelta, timezone

from app.service.plot_tasks import EXPIRE_AFTER_DAYS, _expire_cutoff

KST = timezone(timedelta(hours=9))


def kst(y, m, d, hh=0, mm=0):
    return datetime(y, m, d, hh, mm, tzinfo=KST)


def test_cutoff_is_kst_midnight_minus_window():
    # 9/17 06:00 KST 에 배치가 돌면 경계는 9/14 00:00 KST 다.
    assert _expire_cutoff(kst(2026, 9, 17, 6)) == kst(2026, 9, 14)


def test_cutoff_uses_kst_day_not_utc_day():
    """KST 00:30 은 UTC 로는 전날 15:30 이다. UTC 기준으로 자르면 하루 어긋난다."""
    assert _expire_cutoff(kst(2026, 9, 17, 0, 30)) == kst(2026, 9, 14)
    assert _expire_cutoff(kst(2026, 9, 17, 23, 59)) == kst(2026, 9, 14)


def test_cutoff_is_stable_across_batch_start_jitter():
    """배치가 00:00 에 돌든 00:07 에 돌든 같은 경계여야 한다.

    "지금부터 72시간 전"으로 구현했다면 이 테스트가 깨진다 — 경계에 걸친 카드가
    어떤 날은 닫히고 어떤 날은 안 닫힌다.
    """
    assert _expire_cutoff(kst(2026, 9, 17, 0, 0)) == _expire_cutoff(
        kst(2026, 9, 17, 0, 7)
    )


def test_three_day_old_card_survives_and_four_day_old_expires():
    """정확히 3일째는 살고, 4일째는 닫힌다 — 홈이 보여 주는 범위와 같다."""
    now = kst(2026, 9, 17, 0, 3)
    cutoff = _expire_cutoff(now)

    three_days_old = kst(2026, 9, 14, 0, 3)   # 홈에 "4일째"로 보이는 카드
    four_days_old = kst(2026, 9, 13, 23, 59)  # 홈에서 내려간 카드

    assert three_days_old >= cutoff, "홈에 보이는 카드를 닫으면 안 된다"
    assert four_days_old < cutoff, "홈에서 내려간 카드는 닫혀야 한다"


def test_window_matches_the_screen_constant():
    """Next 의 CARRY_OVER_DAYS 와 같은 값이어야 한다.

    두 저장소가 아니라 두 언어라 타입으로 묶을 수 없다. 값이 바뀌면 이 테스트가
    먼저 깨져서, 반대쪽도 같이 고치라고 알려 준다.
    """
    assert EXPIRE_AFTER_DAYS == 3
