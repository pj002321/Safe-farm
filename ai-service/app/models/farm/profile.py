"""profiles 스키마. 이메일·비밀번호는 여기 없다(auth.users 소관).

FK 는 선언만 해뒀고 DB 에는 아직 없다. auth 를 붙일 때 마이그레이션으로 건다.
그때 auth.users 에 없는 uid 가 남아 있으면 제약 추가가 실패한다(개발 DB 의 더미 등).
"""

from sqlalchemy import Column, DateTime, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import UUID

from app.models.farm.auth_user import auth_users  # noqa: F401  FK 대상 등록용
from app.models.farm.base import FarmBase


class Profile(FarmBase):
    __tablename__ = "profiles"

    # Google 등으로 로그인할 때 Supabase Auth 가 만든 uid 를 그대로 받는다.
    # default 를 두지 않은 건 앱이 uid 를 만들면 auth.users 에 없는 프로필이 생겨서다
    id = Column(
        UUID(as_uuid=True),
        ForeignKey("auth.users.id", ondelete="CASCADE"),
        primary_key=True,
    )

    # 앱에서 사용자를 부르는 이름. 이메일을 노출하지 않으려고 따로 받는다
    nickname = Column(Text, nullable=False)

    # 가입 시각
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    # 탈퇴 시각. NULL 이면 활성이다. 행을 지우지 않는 건 약관 동의 이력을 남겨야 해서다.
    # 조회할 때 deleted_at is null 을 빠뜨리면 탈퇴 회원이 섞인다
    deleted_at = Column(DateTime(timezone=True))
