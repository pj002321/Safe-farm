"""작물 사진 한 장을 보고 AI가 즉석에서 진단한다.

사진만 보고 답하면 병명을 지어낸다. 그래서 두 번 부른다 — ① 사진에서 작물·증상을
짧게 뽑아 ② 그 말로 병해충 문서를 찾고 ③ 사진 + 문서로 진단한다. 검색은 /ask 와 같은
find_matches 를 쓴다(증상말 → 병명 확장, 작물 필터가 거기 있다).

멀티파트 대신 프런트가 읽은 base64 데이터 URL(JSON 필드)을 받는다. 사진은 저장하지 않고
질문·진단 문장만 ask_history 에 남는다(한도 계산용).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.ask import DAILY_LIMIT_MESSAGE
from app.core.config import DAILY_ASK_LIMIT, OPENAI_MODEL
from app.core.db import get_db
from app.core.security import require_service_token
from app.domain.guardrail import BLOCKED_MESSAGE, is_blocked_topic
from app.domain.image_upload import validate_image_data_url
from app.knowledge.embedder import get_client
from app.knowledge.generator import build_context
from app.knowledge.retriever import find_matches
from app.schemas.diagnose import DiagnoseImageRequest, DiagnoseImageResponse
from app.service.ask_history import complete_answer, record_question, today_ask_count

router = APIRouter(prefix="/v1", tags=["diagnose"])


OBSERVE_PROMPT = (
    "사진 속 작물 이름과 눈에 보이는 이상 증상(색·무늬·위치·형태)을 한 줄로만 적어라. "
    "병명은 적지 마라. 예: '고추 잎에 갈색 둥근 반점, 가장자리 노랗게 변함'"
)
# 관찰은 검색어로만 쓴다. 길 필요가 없고, 여기서 병명을 짓게 두면 검색이 그 추측으로 쏠린다.
OBSERVE_MAX_TOKENS = 80

SYSTEM_PROMPT = (
    "너는 작물 사진을 보고 상태를 진단하는 농업 컨설턴트다. 아래 [근거 자료]에 있는 "
    "병해충 중에서 사진의 증상과 맞는 것을 골라 병명·판단 근거·관리 방법을 설명하라. "
    "근거 자료에 맞는 것이 없거나 사진만으로 확신할 수 없으면 그렇다고 말하고 가능성 있는 "
    "후보와 추가로 찍을 부위, 가까운 농업기술센터 상담을 권하라. 근거 자료에 없는 병명을 "
    "단정하지 마라. 농약 희석배수·살포량은 적지 마라. 마지막 줄에 참고한 자료 제목을 적어라."
)

DEFAULT_QUESTION = "이 작물 사진을 보고 상태를 진단해줘."
NO_CONTEXT = "(찾은 자료 없음)"
DIAGNOSE_MARK = "사진 진단"
DIAGNOSE_EXCLUDE = ("variety_summary", "variety_body")


def _image_message(text: str, image_data_url: str) -> dict:
    return {
        "role": "user",
        "content": [
            {"type": "text", "text": text},
            {"type": "image_url", "image_url": {"url": image_data_url}},
        ],
    }

@router.post("/diagnose/image", dependencies=[Depends(require_service_token)])
def diagnose_image(
    request: DiagnoseImageRequest, db: Session = Depends(get_db)
) -> DiagnoseImageResponse:
    """사진 + 선택 질문으로 진단 문장을 한 번에 받는다. 스트리밍하지 않는다."""
    error = validate_image_data_url(request.image_data_url)
    if error:
        raise HTTPException(status_code=400, detail=error)

    if request.question and is_blocked_topic(request.question):
        return DiagnoseImageResponse(diagnosis=BLOCKED_MESSAGE)

    if today_ask_count(db, request.user_id) >= DAILY_ASK_LIMIT:
        return DiagnoseImageResponse(diagnosis=DAILY_LIMIT_MESSAGE)

    question = request.question or DEFAULT_QUESTION
    # LLM 호출 전에 남긴다. 실패해  무한히 두드리지 못한다.
    history = record_question(db, request.user_id, question, message=DIAGNOSE_MARK)

    client = get_client()
    observed = client.chat.completions.create(
        model=OPENAI_MODEL,
        max_tokens=OBSERVE_MAX_TOKENS,
        messages=[_image_message(OBSERVE_PROMPT, request.image_data_url)],
    ).choices[0].message.content or ""

    # 사용자 질문을 앞에 둔다 — 작물 이름을 직접 적었으면 그게 사진 추측보다 정확하다.
    matches = find_matches(
        db, f"{request.question or ''} {observed}".strip(), exclude_sources=DIAGNOSE_EXCLUDE
    )
    context = build_context(matches) if matches else NO_CONTEXT

    diagnosis = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            _image_message(
                f"[근거 자료]\n{context}\n\n[관찰]\n{observed}\n\n[질문]\n{question}",
                request.image_data_url,
            ),
        ],
    ).choices[0].message.content or ""

    complete_answer(db, history, diagnosis)
    return DiagnoseImageResponse(diagnosis=diagnosis)
