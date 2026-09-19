"""이맘때 이 작물에 미리 해 둘 재해 대비. `disaster_bulletins` 에서 읽는다.

★ 2026-09-19 — 이 표는 1,881행이 적재돼 있는데 **꺼내 쓰는 코드가 적재 스크립트
  뿐이었다.** 벡터로는 614건이 들어가 있어 질문답변에는 잡히지만, 리포트와 카드는
  벡터를 안 봐서 같은 자료가 그쪽엔 안 닿았다.

⚠ **사전대책만 쓴다.** `phase` 가 넷이다 —

      사후대책 895 · 사전대책 844 · 발생시 45 · 발생전 45 · 종료후 43 · 발생후 9

  "물에 잠긴 뒤 요소 엽면시비" 같은 사후대책을 평상시 리포트에 실으면, 아무 일도
  없는 밭에 대고 피해를 수습하라고 하는 꼴이 된다.

⚠ **연도를 안 본다.** 2023년 이후 자료라 올해 그 재해가 온다는 뜻이 아니다.
  달만 맞춰 "해마다 이맘때 대비하는 것" 으로 쓴다. 문장을 만드는 쪽(report)이
  그 선을 지킨다.
"""

from __future__ import annotations

import re

from sqlalchemy.orm import Session

from app.domain.livestock import is_livestock
from app.repo.bulletin import disaster_hazards_for

#: 미리 하는 것만. '발생전' 도 같은 결이다
_PHASES = ("사전대책", "발생전")

#: 리포트에 실을 최대 줄 수. 더 넣으면 프롬프트에서 작물·기상 얘기가 밀린다
MAX_NOTES = 2

#: 한 줄의 최대 길이. 원문이 한 항목에 여러 문장을 잇는 일이 있다
_MAX_LEN = 90

#: 본문이 '○' 로 항목을 나눈다. 첫 항목만 쓴다 — 대개 그것이 핵심이다
_BULLET = re.compile(r"[○ㅇ●・*]\s*")


def _첫항목(본문: str) -> str:
    """'○ …' 로 나뉜 본문에서 쓸 만한 첫 항목. 너무 길면 자른다.

    ⚠ **축산 항목은 건너뛰고 다음 것을 쓴다.** 이 표는 작물이 '더덕'·'감자' 인 행의
      본문에도 축사 대책을 같이 적어 둔다. 실측(2026-09-19) 133작물 × 12달 중
      더덕 10월이 "축사 주변 배수로 정비" 를 리포트로 내보내고 있었다.

    ⚠ **자른 뒤에 판정한다.** 원문 항목 끝에 '황사 대비 농작물 및 가축 관리요령'
      같은 목차가 붙어 오는 일이 있어, 자르기 전 글로 보면 포도 개화기 얘기가
      축산으로 몰려 통째로 날아간다. 내보낼 글자만 보고 고른다.
    """
    for 조각 in (" ".join(x.split()) for x in _BULLET.split(본문 or "") if x.strip()):
        쓸것 = 조각 if len(조각) <= _MAX_LEN else 조각[:_MAX_LEN].rstrip() + "…"
        if not is_livestock(쓸것):
            return 쓸것
    return ""


def prevention_notes_for(db: Session, crop_name_ko: str, month: int) -> tuple[str, ...]:
    """("집중호우: 배수구를 깊게 정비하여…", …). 없으면 빈 튜플이다.

    ⚠ 작물명은 `crop_names` 안에 쉼표로 이어져 있다. **토막째 맞춘다** —
      부분 일치로 하면 '배' 가 '배추' 에 걸린다(pest_notes 에서 겪은 것과 같다).
    """
    rows = disaster_hazards_for(db, crop_name_ko, month, _PHASES)

    나온것: list[str] = []
    for r in rows:
        본문 = _첫항목(r.body)
        if 본문:
            나온것.append(f"{r.hazard}: {본문}")
        if len(나온것) >= MAX_NOTES:
            break
    return tuple(나온것)
