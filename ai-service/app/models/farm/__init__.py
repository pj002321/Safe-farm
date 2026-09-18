"""세이프팜 앱 테이블 ORM. 스키마 스펙이 기준이고, 여기서 테이블을 만들지 않는다.

여기서 한 번에 import 해야 FarmBase.metadata 가 테이블 전부를 안다.

relationship 은 두지 않는다. 조회는 명시적 join 으로 쓴다.
"""

from app.models.farm.advice import Advice, FarmAdvice
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
    "Advice",
    "FarmAdvice",
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
