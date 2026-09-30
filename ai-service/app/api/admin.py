"""관리자 화면이 부르는 AI 분석. 관리자 인증은 Next 가 하고, 여기는 서비스 토큰만 본다."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import require_service_token
from app.service.at_risk import at_risk_report
from app.service.briefing import weekly_briefing
from app.service.member_insight import analyze_member
from app.service.ops_status import batch_status, diagnose_batches, index_status
from app.service.question_trend import analyze_questions

router = APIRouter(
    prefix="/v1/admin", tags=["admin"], dependencies=[Depends(require_service_token)]
)


@router.post("/briefing")
def briefing(db: Session = Depends(get_db)) -> dict:
    return weekly_briefing(db)


@router.post("/members/at-risk")
def members_at_risk(db: Session = Depends(get_db)) -> dict:
    return at_risk_report(db)


@router.post("/members/{user_id}/insight")
def member_insight(user_id: uuid.UUID, db: Session = Depends(get_db)) -> dict:
    return analyze_member(db, user_id)


@router.post("/questions/trends")
def question_trends(db: Session = Depends(get_db)) -> dict:
    return analyze_questions(db)


@router.get("/batches")
def batches(db: Session = Depends(get_db)) -> dict:
    return batch_status(db)


@router.post("/batches/diagnose")
def batches_diagnose(db: Session = Depends(get_db)) -> dict:
    return diagnose_batches(db)


@router.get("/index")
def index(db: Session = Depends(get_db)) -> dict:
    return index_status(db)
