"""작물 사진 한 장을 보고 AI가 즉석에서 진단한다.

멀티파트 파일 업로드 대신 프런트가 이미 읽은 base64 데이터 URL(JSON 필드)을 받는다 —
python-multipart 의존성을 새로 안 들이고, 이 서비스의 다른 라우터와 같은 JSON 계약을
그대로 쓴다. 저장은 하지 않는다(일회성) — Storage에도, ask_history에도 남기지 않는다.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.core.config import OPENAI_MODEL
from app.core.security import require_service_token
from app.domain.image_upload import validate_image_data_url
from app.knowledge.embedder import get_client
from app.schemas.diagnose import DiagnoseImageRequest, DiagnoseImageResponse

router = APIRouter(prefix="/v1", tags=["diagnose"])

SYSTEM_PROMPT = (
    "너는 작물 사진을 보고 상태를 진단하는 농업 컨설턴트다. 사진에서 보이는 병해충·"
    "영양결핍·생육 이상 징후를 근거로 설명하고, 사진만으로 확신할 수 없으면 그렇다고 "
    "말하고 전문가 상담이나 추가 사진을 권하라. 안 보이는 것을 지어내지 마라."
)

DEFAULT_QUESTION = "이 작물 사진을 보고 상태를 진단해줘."


@router.post("/diagnose/image", dependencies=[Depends(require_service_token)])
def diagnose_image(request: DiagnoseImageRequest) -> DiagnoseImageResponse:
    """사진 + 선택 질문으로 진단 문장을 한 번에 받는다. /ask 와 달리 근거 조각이
    없어 스트리밍하지 않는다 — 중간에 보여줄 게 없다.
    """
    error = validate_image_data_url(request.image_data_url)
    if error:
        raise HTTPException(status_code=400, detail=error)

    response = get_client().chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": request.question or DEFAULT_QUESTION},
                    {"type": "image_url", "image_url": {"url": request.image_data_url}},
                ],
            },
        ],
    )
    return DiagnoseImageResponse(diagnosis=response.choices[0].message.content or "")
