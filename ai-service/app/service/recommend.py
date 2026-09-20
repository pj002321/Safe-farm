"""작물 추천의 실 구현 — `CandidateLoader`·`WeatherFetcher`·`ExplainLLM`.

그래프(`app/graph/graph.py`)는 이 셋을 인자로만 받는다. DB·Open-Meteo·OpenAI 를
실제로 부르는 자리는 여기뿐이다 — 그래프·도메인은 이 파일을 모른다.
"""

from __future__ import annotations

import asyncio
from datetime import date

from sqlalchemy.orm import Session

from app.core.config import OPENAI_MODEL
from app.domain.crop_fit import CropCandidate, DailyWeather, HazardRule, SowWindow
from app.domain.geo import nearest
from app.knowledge.embedder import get_client
from app.repo.crop import all_crops, disaster_rules_of, variants_of
from app.repo.normal import normals_of
from app.repo.station import all_stations
from app.service.gdd_region import NORMAL_SOURCES
from pipeline.open_meteo_client import fetch_forecast, normalize_daily_forecast

# 최근 실측만 본다 — "지금 심어도 되나" 는 최근 추세면 충분하고, 영농일지 배치가
# 쓰는 92일까지 갈 이유가 없다(pipeline/open_meteo_client.py 의 DIARY_PAST_DAYS 참고).
RECENT_DAYS = 7


def load_candidates(db: Session) -> list[CropCandidate]:
    """기준온도(base_temp)가 있는 작물만 후보로 올린다.

    base_temp 가 없으면 GDD 속도 축을 못 재 판정의 절반이 빠진다 —
    `repo.crop.usable_crop_of_variant` 가 GDD 경로에서 거르는 것과 같은 이유다
    (133작물 중 16만 남는다, crops.py §B-2).
    """
    crops = [c for c in all_crops(db) if c.base_temp is not None]
    if not crops:
        return []

    crop_ids = [c.crop_id for c in crops]
    variants = variants_of(db, crop_ids)
    rules = disaster_rules_of(db, crop_ids)

    windows_by_crop: dict[int, list[SowWindow]] = {}
    for v in variants:
        windows_by_crop.setdefault(v.crop_id, []).append(SowWindow(v.sow_from, v.sow_to))

    rules_by_crop: dict[int, list[HazardRule]] = {}
    for r in rules:
        rules_by_crop.setdefault(r.crop_id, []).append(
            HazardRule(r.hazard, r.stage_name, r.metric, r.op, float(r.threshold_c))
        )

    return [
        CropCandidate(
            crop_id=c.crop_id,
            name_ko=c.name,
            base_temp_c=float(c.base_temp),
            upper_temp_c=float(c.upper_temp) if c.upper_temp is not None else None,
            sow_windows=tuple(windows_by_crop.get(c.crop_id, ())),
            hazard_rules=tuple(rules_by_crop.get(c.crop_id, ())),
        )
        for c in crops
    ]


def make_candidate_loader(db: Session):
    """`CandidateLoader`(무인자) 시그니처에 맞춘 클로저. 세션을 그래프에 안 넘기려고 감싼다."""

    async def load() -> list[CropCandidate]:
        return load_candidates(db)

    return load


def _station_normals(db: Session, station_code: str) -> dict[tuple[int, int], tuple[float, float]]:
    """이 관측소의 (월,일)별 평년 최고·최저기온. `NORMAL_SOURCES` 순서로 한 번만 찾는다
    (관측소가 하나뿐이라 `gdd_region._normal_gdd_by_station` 의 잔여-재질의는 필요 없다)."""
    for source in NORMAL_SOURCES:
        rows = normals_of(db, [station_code], source)
        by_day = {
            (m, d): (tmax, tmin)
            for _stn, m, d, tmax, tmin in rows
            if tmax is not None and tmin is not None
        }
        if by_day:
            return by_day
    return {}


def make_weather_fetcher(db: Session):
    """`WeatherFetcher` 시그니처에 맞춘 클로저. 평년값 조회에 DB 세션이 필요해
    `make_candidate_loader` 와 같은 이유로 감싼다."""

    async def fetch(lat: float, lon: float) -> tuple[DailyWeather, ...]:
        return await fetch_recent_weather(db, lat, lon)

    return fetch


async def fetch_recent_weather(db: Session, lat: float, lon: float) -> tuple[DailyWeather, ...]:
    """이 좌표의 최근 RECENT_DAYS 일 실측 + 가장 가까운 관측소의 같은 날짜 평년값.

    `fetch_forecast` 는 동기 requests 호출이라 `asyncio.to_thread` 로 감싼다 —
    안 그러면 이벤트 루프가 그동안 막힌다.

    평년값은 explain 노드가 "일시적 수치"가 아니라 "평년 대비"로 설명하게 하는
    용도뿐이라, 관측소가 없거나 평년값이 없어도 실측 자체는 그대로 낸다
    (`tmax_normal_c`/`tmin_normal_c` 가 None 인 채로).

    ⚠ 지금은 과거분만 쓴다. 다가올 한파·폭염까지 보려면 `days` 를 늘려 미래분을
      같이 받고 오늘 이후 날짜만 갈라 `score_fit` 의 `forecast` 인자로 넘기면 된다 —
      아직은 "지금 심어도 되나"만 보면 되어 뺐다.
    """
    payload = await asyncio.to_thread(fetch_forecast, lat, lon, 1, RECENT_DAYS)
    today = date.today().isoformat()
    rows = normalize_daily_forecast(payload["daily"])

    station = nearest(lat, lon, all_stations(db))
    normals = _station_normals(db, station.station_code) if station else {}

    result = []
    for r in rows:
        if not (r["date"] < today and r["temp_max"] is not None and r["temp_min"] is not None):
            continue
        month, day = int(r["date"][5:7]), int(r["date"][8:10])
        pair = normals.get((month, day))
        result.append(
            DailyWeather(
                date=r["date"],
                tmax_c=r["temp_max"],
                tmin_c=r["temp_min"],
                tmax_normal_c=pair[0] if pair else None,
                tmin_normal_c=pair[1] if pair else None,
            )
        )
    return tuple(result)


async def explain_with_llm(messages: list[dict]) -> str:
    """`ExplainLLM` 시그니처. `nodes.plan` 과 같은 raw OpenAI 클라이언트를 쓴다 —
    langchain 의 ChatOpenAI 는 이 프로젝트가 안 쓰는 별도 의존이라 안 들인다."""
    response = await asyncio.to_thread(
        get_client().chat.completions.create,
        model=OPENAI_MODEL,
        messages=messages,
    )
    return response.choices[0].message.content or ""
