"""세이프팜 앱 테이블 ORM. 스키마 스펙이 기준이고, 여기서 테이블을 만들지 않는다.

여기서 한 번에 import 해야 FarmBase.metadata 가 테이블 전부를 안다.

relationship 은 두지 않는다. 조회는 명시적 join 으로 쓴다.

아직 없는 테이블 — 스펙에서 잘려 컬럼을 확정할 수 없다. 추측해서 만들지 않는다.
  advices       정의 자체가 없음 (인덱스 목록과 jsonb 언급만 존재)
"""

from app.models.farm.ask_history import AskHistory
from app.models.farm.auth_user import auth_users
from app.models.farm.base import FarmBase
from app.models.farm.crop import Crop
from app.models.farm.crop_disaster_rule import CropDisasterRule
from app.models.farm.crop_guide import CropGuide
from app.models.farm.crop_stage import CropStage
from app.models.farm.crop_variant import CropVariant
from app.models.farm.cultivation import Cultivation
from app.models.farm.disaster_bulletin import DisasterBulletin
from app.models.farm.grid import Grid
from app.models.farm.pest import PestAlert, PestBulletin
from app.models.farm.plot import Plot
from app.models.farm.plot_task import PlotTask
from app.models.farm.profile import Profile
from app.models.farm.station import Station
from app.models.farm.terms import Terms
from app.models.farm.user_agreement import UserAgreement
from app.models.farm.variety import Variety
from app.models.farm.weather_obs_daily import WeatherObsDaily
from app.models.farm.weekly_note import WeeklyNote

__all__ = [
    "AskHistory",
    "Crop",
    "DisasterBulletin",
    "CropDisasterRule",
    "CropGuide",
    "CropStage",
    "CropVariant",
    "Cultivation",
    "FarmBase",
    "Grid",
    "PestAlert",
    "PestBulletin",
    "Plot",
    "PlotTask",
    "Profile",
    "Station",
    "Terms",
    "Variety",
    "UserAgreement",
    "WeatherObsDaily",
    "WeeklyNote",
    "auth_users",
]
