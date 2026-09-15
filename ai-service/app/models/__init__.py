"""모델을 한 번은 import 해야 Base.metadata 가 테이블을 안다.

init_doc_db 가 `from app import models` 한 줄로 전부 등록되게 하려고 여기 모아둔다.
"""

from app.models.alert import OfficialAlert
from app.models.chunk import Chunk
from app.models.disaster_rule import DisasterRule
from app.models.document import Document
from app.models.normal import Normal
from app.models.weather import WeatherDaily

__all__ = ["Chunk", "DisasterRule", "Document", "Normal", "OfficialAlert", "WeatherDaily"]
