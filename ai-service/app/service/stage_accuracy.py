"""생육단계 예측 정확도 — 사용자가 고친 단계(STAGE_SET)를 정답으로 삼아 GDD 모델을 잰다.

사용자가 "이 날 이 단계였다"고 고치면, 그 날까지의 관측으로 모델이 냈을 단계를 다시 계산해
둘을 비교한다. 화면이 쓰는 `cultivation_growth` 와 같은 재료(gdd_origin·daily_gdd·stage_at_gdd)로
계산한다 — 다른 식으로 재면 화면의 모델이 아니라 다른 모델을 재게 된다.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.domain.gdd import daily_gdd
from app.domain.stage_accuracy import summarize_errors
from app.models.farm import Cultivation, Plot
from app.repo import admin as repo
from app.repo.crop import stage_at_gdd, stage_by_order, usable_crop_of_variant
from app.repo.plot import live_plot
from app.repo.weather_obs import temps_since
from app.service.plot_growth import gdd_origin, nearest_station

def _predict(db: Session, cultivation: Cultivation, plot: Plot, on) -> tuple[int | None, str | None, str | None]:
    """(예측 단계 순번, 예측 단계 이름, 오차 계산에서 뺄 이유 — 쓸 수 있으면 None)."""
    if cultivation.sowing_date is None:
        return None, None, "파종일이 없어 모델이 예측할 수 없음"
    station = nearest_station(db, plot)
    crop = usable_crop_of_variant(db, cultivation.variant_id)
    if station is None or crop is None:
        return None, None, "관측소나 작물 기준온도가 없어 예측할 수 없음"
    start, acc0, _ = gdd_origin(db, cultivation)
    obs = [o for o in temps_since(db, station.station_code, start) if o.obs_date <= on]
    upper = float(crop.upper_temp) if crop.upper_temp is not None else None
    acc = acc0 + sum(
        daily_gdd(float(o.temp_max), float(o.temp_min), float(crop.base_temp), upper) for o in obs
    )
    stage = stage_at_gdd(db, cultivation.variant_id, acc)
    excluded = None if obs and obs[-1].obs_date >= on else "그날까지 기상 관측이 없어 GDD 가 덜 쌓임"
    return (stage.stage_order if stage else None), (stage.stage_name if stage else None), excluded


def stage_accuracy(db: Session) -> dict:
    history, rows = [], []
    for e in repo.stage_events(db):
        item = {"kind": e["kind"], "occurredOn": e["occurred_on"], "createdAt": e["created_at"]}
        if e["kind"] == "STAGE_ADD":
            history.append({**item, "actual": e["body"], "predicted": None, "note": "단계표에 없는 단계를 추가"})
            continue

        cultivation = repo.cultivation_by_id(db, e["cultivation_id"])
        plot = live_plot(db, e["plot_id"])
        actual = stage_by_order(db, cultivation.variant_id, e["stage_order"])
        predicted_order, predicted_name, excluded = _predict(db, cultivation, plot, e["occurred_on"])
        note = f"{excluded} — 오차 계산에서 제외" if excluded else None
        history.append({
            **item,
            "actual": actual.stage_name if actual else f"{e['stage_order']}단계",
            "predicted": predicted_name,
            "error": predicted_order - e["stage_order"] if predicted_order is not None else None,
            "note": note,
        })
        rows.append({
            "predicted": predicted_order,
            "actual": e["stage_order"],
            "stage": actual.stage_name if actual else f"{e['stage_order']}단계",
            "usable": excluded is None,
        })

    return {"summary": summarize_errors(rows), "history": history}
