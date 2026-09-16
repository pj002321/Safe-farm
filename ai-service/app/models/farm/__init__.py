"""세이프팜 앱 테이블 ORM. 스키마 스펙이 기준이고, 여기서 테이블을 만들지 않는다.

여기서 한 번에 import 해야 FarmBase.metadata 가 테이블 전부를 안다.

relationship 은 두지 않는다. 조회는 명시적 join 으로 쓴다.

아직 없는 테이블 — 스펙에서 잘려 컬럼을 확정할 수 없다. 추측해서 만들지 않는다.
  plots         8번 헤더는 plots 인데 본문이 crops 컬럼이라 실제 컬럼 미상
  cultivations  gdd_updated_at 이후가 인덱스 목록과 섞이며 잘림 (status, deleted_at 등)
  advices       정의 자체가 없음 (인덱스 목록과 jsonb 언급만 존재)
"""

from app.models.farm.auth_user import auth_users
from app.models.farm.base import FarmBase
from app.models.farm.crop import Crop
from app.models.farm.crop_disaster_rule import CropDisasterRule
from app.models.farm.crop_stage import CropStage
from app.models.farm.crop_variant import CropVariant
from app.models.farm.variety import Variety
from app.models.farm.grid import Grid
from app.models.farm.profile import Profile
from app.models.farm.station import Station
from app.models.farm.terms import Terms
from app.models.farm.user_agreement import UserAgreement
from app.models.farm.weather_forecast import WeatherForecast
from app.models.farm.weather_obs_daily import WeatherObsDaily

__all__ = [
    "Crop",
    "CropDisasterRule",
    "CropStage",
    "CropVariant",
    "FarmBase",
    "Grid",
    "Profile",
    "Station",
    "Terms",
    "Variety",
    "UserAgreement",
    "WeatherForecast",
    "WeatherObsDaily",
    "auth_users",
]
