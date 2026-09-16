"""품종 카탈로그 응답 모양. `/v1/varieties` 가 돌려주는 계약이다.

⚠ **목록(VarietySummaryOut)에는 summary·body 가 없다.** 품종이 많은 작물은
  수백 개라 선택지 그리는 데 품종마다 수 KB 짜리 본문을 보낼 이유가 없다
  (app/schemas/crop.py 의 CropSummaryOut 과 같은 이유).
"""

from pydantic import BaseModel


class VarietySummaryOut(BaseModel):
    """목록용. 밭 등록 화면의 품종 선택지가 쓴다."""

    variety_no: str
    crop_name: str
    name: str
    maturity_type: str | None = None
    use: str | None = None
    bred_year: int | None = None


class VarietyDetailOut(VarietySummaryOut):
    """상세용. 목록에 주요특성·본문·지대·육성기관·GDD 연결(variant_id)을 얹은 모양이다."""

    summary: str | None = None
    body: str | None = None
    zone: str | None = None
    breeder: str | None = None
    variant_id: int | None = None
