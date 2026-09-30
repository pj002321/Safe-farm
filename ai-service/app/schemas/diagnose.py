"""작물 사진 진단 요청 모양. 사진은 저장하지 않고 질문,진단 문장만 ask_history에 남긴다.
"""

import uuid
from pydantic import BaseModel, Field


class DiagnoseImageRequest(BaseModel):
    """image_data_url 은 프런트가 이미 base64로 읽은 데이터 URL 전체
    ("data:image/jpeg;base64,...")다. question 이 없으면 기본 질문으로 진단한다.
    user_id는 일일 한도를 /ask와 같이 세기 위해 받는다.
    """
    user_id: uuid.UUID
    image_data_url: str = Field(..., min_length=1)
    question: str | None = Field(None, max_length=500)


class DiagnoseImageResponse(BaseModel):
    diagnosis: str
