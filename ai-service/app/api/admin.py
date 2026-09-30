"""관리자 화면이 부르는 AI 분석. 관리자 인증은 Next 가 하고, 여기는 서비스 토큰만 본다."""

from __future__ import annotations

import uuid

from datetime import date

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import require_service_token
from app.service.at_risk import at_risk_report
from app.service.briefing import weekly_briefing
from app.service.member_insight import analyze_member
from app.service.ops_status import (
    batch_status,
    diagnose_batches,
    embed_missing,
    index_status,
    start_rerun,
    system_status,
)
from app.service.retrieval_eval import evaluate
from app.service.stage_accuracy import stage_accuracy
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


class RerunRequest(BaseModel):
    job: str
    date_from: date | None = None
    date_to: date | None = None


@router.post("/batches/rerun")
def batches_rerun(body: RerunRequest) -> dict:
    # 거절도 200 으로 돌려준다. Next 의 aiService.call 은 4xx 본문을 버리고 상태코드만 남겨서,
    # "이미 진행 중" 같은 이유가 관리자 화면까지 가지 못한다.
    try:
        return {"started": True, **start_rerun(body.job, body.date_from, body.date_to)}
    except ValueError as exc:
        return {"started": False, "error": str(exc)}


@router.get("/system")
def system(db: Session = Depends(get_db)) -> dict:
    return system_status(db)


@router.post("/index/embed-missing")
def index_embed_missing(db: Session = Depends(get_db)) -> dict:
    return embed_missing(db)


@router.post("/retrieval/eval")
def retrieval_eval(db: Session = Depends(get_db)) -> dict:
    return evaluate(db)


@router.get("/accuracy")
def accuracy(db: Session = Depends(get_db)) -> dict:
    return stage_accuracy(db)
