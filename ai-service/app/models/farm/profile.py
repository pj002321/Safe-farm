"""profiles 스키마. 이메일·비밀번호는 여기 없다(auth.users 소관).

auth.users 로 FK 를 걸지 않는다. 그 테이블은 Supabase 소유라 우리 DDL 이 제약을 만들
자리가 아니고, auth 없이도 개발 DB 가 혼자 돌아야 한다. id 가 auth.users.id 와 같은
값이라는 약속은 앱이 지킨다 — auth 를 붙일 때 마이그레이션으로 FK 를 건다.
그때 auth.users 에 없는 uid 가 남아 있으면 제약 추가가 실패한다(개발 DB 의 더미 등).
"""

from sqlalchemy import Column, DateTime, Text, func
from sqlalchemy.dialects.postgresql import UUID

from app.models.farm.base import FarmBase


class Profile(FarmBase):
    __tablename__ = "profiles"

    # Google 등으로 로그인할 때 Supabase Auth 가 만든 uid 를 그대로 받는다.
    # default 를 두지 않은 건 앱이 uid 를 만들면 auth.users 에 없는 프로필이 생겨서다
    id = Column(UUID(as_uuid=True), primary_key=True)

    # 앱에서 사용자를 부르는 이름. 이메일을 노출하지 않으려고 따로 받는다
    nickname = Column(Text, nullable=False)

    # 가입 시각
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    # 탈퇴 시각. NULL 이면 활성이다. 행을 지우지 않는 건 약관 동의 이력을 남겨야 해서다.
    # 조회할 때 deleted_at is null 을 빠뜨리면 탈퇴 회원이 섞인다
    deleted_at = Column(DateTime(timezone=True))
