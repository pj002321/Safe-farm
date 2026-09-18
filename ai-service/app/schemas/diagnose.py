"""작물 사진 진단 요청 모양. 저장 없이 한 번 진단하고 끝나는 기능이라 ask_history
같은 이력 테이블을 두지 않는다.
"""

from pydantic import BaseModel, Field


class DiagnoseImageRequest(BaseModel):
    """image_data_url 은 프런트가 이미 base64로 읽은 데이터 URL 전체
    ("data:image/jpeg;base64,...")다. question 이 없으면 기본 질문으로 진단한다.
    """
    image_data_url: str = Field(..., min_length=1)
    question: str | None = Field(None, max_length=500)


class DiagnoseImageResponse(BaseModel):
    diagnosis: str
