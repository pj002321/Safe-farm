"""profiles 스키마. 정본은 supabase/migrations/20260914000000_profiles.sql 이다.

여기 정의는 그 마이그레이션을 따라 적은 사본이다 — 컬럼이 갈리면 마이그레이션 쪽이 맞다.
RLS·트리거(updated_at 자동 갱신, 동의시각 보존, 가입 시 자동 생성)는 마이그레이션에만
있으므로 이 ORM 으로 만든 테이블은 반쪽이다. init_farm_db 가 기본으로 건너뛰는 이유다.

이메일·비밀번호 인증 자체는 auth.users 소관이다. auth.users 로 FK 를 걸지 않는 것은
그 테이블이 Supabase 소유이고, auth 없이도 개발 DB 가 혼자 돌아야 해서다.
id 가 auth.users.id 와 같은 값이라는 약속은 앱이 지킨다.
"""

from sqlalchemy import Boolean, CheckConstraint, Column, DateTime, Text, func, text
from sqlalchemy.dialects.postgresql import UUID

from app.models.farm.base import FarmBase


class Profile(FarmBase):
    __tablename__ = "profiles"

    # 가입할 때 Supabase Auth 가 만든 uid 를 그대로 받음.
    # default 를 두지 않은 건 앱이 uid 를 만들면 auth.users 에 없는 프로필이 생겨서다
    id = Column(UUID(as_uuid=True), primary_key=True)

    # 로그인 이메일 사본. 정본은 auth.users 라 여기 값으로 인증하지 않음
    email = Column(Text, nullable=False)

    # 표시용 사본임. 권한 판단은 auth.users 의 raw_app_meta_data->>'role' 로 함 —
    # 이 컬럼은 사용자가 바꿀 수 있는 자리라 신뢰하지 않음
    role = Column(Text, nullable=False, server_default=text("'user'"))

    full_name = Column(Text)
    avatar_url = Column(Text)

    # 어떤 경로로 가입했는가. 'email' | 'google' 등
    signup_provider = Column(Text, nullable=False, server_default=text("'email'"))

    # 동의 시각. 법적 근거로 쓰는 값이라 한 번 찍히면 덮어쓰지 않음
    # (보장하는 트리거는 마이그레이션에 있음)
    terms_agreed_at = Column(DateTime(timezone=True))
    privacy_agreed_at = Column(DateTime(timezone=True))

    marketing_opt_in = Column(Boolean, nullable=False, server_default="false")

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    # 갱신은 마이그레이션의 touch_updated_at 트리거가 함. 앱이 직접 넣지 않음
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        CheckConstraint("role in ('admin', 'user')", name="profiles_role_check"),
    )
