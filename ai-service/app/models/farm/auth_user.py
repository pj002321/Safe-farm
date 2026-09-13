"""auth.users 참조용 스텁. Supabase Auth 소유라 우리가 만들지도, 읽지도 않는다.

profiles.id 의 FK 가 가리킬 대상이 메타데이터에 없으면 매퍼 구성이
NoReferencedTableError 로 터진다. 그래서 컬럼은 id 하나만 둔다 — 실제 auth.users 는
email, raw_app_meta_data 등이 더 있지만 FK 해석에 필요한 건 참조 대상 컬럼뿐이다.

ORM 클래스가 아니라 Table 인 이유: 조회·삽입 대상이 될 수 없게 하려고.

경고: 이 테이블이 FarmBase.metadata 에 들어가므로 create_all() 을 돌리면 만들려고 든다.
FarmBase 를 app.core.db.Base 와 분리하고 app/models/__init__.py 가 farm 을 import 하지
않는 이유가 이거다. 그 둘을 깨지 말 것.
"""

from sqlalchemy import Column, Table
from sqlalchemy.dialects.postgresql import UUID

from app.models.farm.base import FarmBase

auth_users = Table(
    "users",
    FarmBase.metadata,
    Column("id", UUID(as_uuid=True), primary_key=True),
    schema="auth",
)
