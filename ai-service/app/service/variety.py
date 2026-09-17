"""품종 카탈로그를 화면이 쓸 모양으로 묶는다.

repo 는 ORM 객체를 그대로 주고, 이 파일이 dict 로 바꾼다. api 는 여기서 받은
dict 를 그대로 내보낸다(app/service/crop.py 와 같은 규칙).

⚠ **목록(variety_list)에는 summary·body 를 싣지 않는다.** 품종이 많은 작물은
  수백 개라 선택지를 그리는 데 품종마다 수 KB 짜리 본문을 실어 보낼 이유가
  없다 — CropSummaryOut 이 단계를 안 싣는 것과 같은 이유.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.repo.variety import variety_by_no, varieties_of


def variety_list(db: Session, crop_name: str | None) -> list[dict]:
    """
    # summary
    품종 목록. 밭 등록 화면의 품종 선택지다. summary·body 는 읽지 않는다.

    # params
    db: 세션<br>
    crop_name: 작물 이름으로 거른다. None 이면 전체<br>

    # returns
    이름순 dict 목록

    # examples
        variety_list(db, '고추')
        -> [{'variety_no': '268123', 'crop_name': '고추', 'name': '원강7호',
             'maturity_type': '', 'use': '', 'bred_year': 2021}, ...]
    """
    return [
        {
            "variety_no": v.variety_no,
            "crop_name": v.crop_name,
            "name": v.name,
            "maturity_type": v.maturity_type,
            "use": v.use,
            "bred_year": v.bred_year,
        }
        for v in varieties_of(db, crop_name)
    ]


def variety_detail(db: Session, variety_no: str) -> dict | None:
    """
    # summary
    품종 하나의 전체 정보. summary·body 를 포함한다. 품종 상세 화면이 쓴다.

    # params
    db: 세션<br>
    variety_no: 농사로 cntntsNo<br>

    # returns
    dict 하나. 없으면 None

    # examples
        variety_detail(db, '268123')
        -> {'variety_no': '268123', 'name': '원강7호', 'summary': '- 풋마름병에 …',
            'body': '...', 'zone': '...', 'breeder': '...', 'variant_id': 7, ...}
    """
    v = variety_by_no(db, variety_no)
    if v is None:
        return None
    return {
        "variety_no": v.variety_no,
        "crop_name": v.crop_name,
        "name": v.name,
        "maturity_type": v.maturity_type,
        "use": v.use,
        "bred_year": v.bred_year,
        "summary": v.summary,
        "body": v.body,
        "zone": v.zone,
        "breeder": v.breeder,
        "variant_id": v.variant_id,
    }
