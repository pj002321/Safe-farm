"""
---------------------------------------------
[Feature]: 추천 질문 3건 (순수 함수)

[Description]
- 초기 화면이 비어 있으면 사용자는 무엇을 물어도 되는지 모른다. 지금 밭에서
  실제로 할 법한 질문 세 개를 대신 적어 둔다.
- **LLM 을 부르지 않는다.** 생육단계 이름 하나로 정해지는 일이라 호출을 붙이면
  응답 지연과 요금만 는다. 규칙 템플릿이면 충분하다(웹의 growthReport.ts 와 같은 판단).
- 단계 이름은 품종마다 달라(결구·착과·등숙…) 정확히 일치시키지 않고 **부분 문자열**로
  고른다. crop_stages 는 우리가 채우는 표가 아니라 작물 마스터에서 오므로,
  이름 목록을 여기 고정해 두면 새 작물이 들어올 때마다 이 파일이 밀린다.
- 순수 함수라 DB·LLM 없이 pytest 로 바로 검증된다.

[Usage]
```python
suggest_questions("배추", "결구기")
# -> ["배추 결구기에 물은 얼마나 자주 줘야 하나요?", ...]
```
---------------------------------------------
"""

from __future__ import annotations

#: 뽑아 줄 질문 수. 화면의 칩 세 개와 같은 값이라 여기서 정한다.
SUGGESTION_COUNT = 3

#: 단계 이름에 이 조각이 들어 있으면 그 묶음을 쓴다. 위에서부터 먼저 맞는 것.
#: `{crop}` 은 작물 이름, `{stage}` 는 단계 이름으로 채운다.
_STAGE_TEMPLATES: tuple[tuple[tuple[str, ...], tuple[str, ...]], ...] = (
    (
        ("발아", "출아", "육묘"),
        (
            "{crop} 싹이 고르게 안 나면 무엇을 확인해야 하나요?",
            "{crop} {stage}에는 물을 얼마나 자주 줘야 하나요?",
            "{crop} 모종을 옮겨 심기 좋은 시기는 언제인가요?",
        ),
    ),
    (
        ("정식", "활착"),
        (
            "{crop}을 옮겨 심은 뒤 잎이 처지면 어떻게 해야 하나요?",
            "{crop} {stage} 때 웃거름은 언제 주나요?",
            "{crop} 심는 간격은 얼마가 적당한가요?",
        ),
    ),
    (
        ("생육", "엽", "신장", "분얼"),
        (
            "{crop} {stage}에 주는 웃거름은 어떤 종류가 좋나요?",
            "{crop} 잎에 누런 반점이 생기면 무엇을 의심해야 하나요?",
            "{crop} 밭의 잡초는 어떻게 관리하나요?",
        ),
    ),
    (
        ("개화", "착과", "수정"),
        (
            "{crop} 꽃이 피었는데 열매가 안 달리면 왜 그런가요?",
            "{crop} {stage} 때 물주기는 어떻게 바꿔야 하나요?",
            "{crop} 열매를 솎아 줘야 하나요?",
        ),
    ),
    (
        ("결구", "비대", "괴경", "구근"),
        (
            "{crop} {stage}에 물은 얼마나 자주 줘야 하나요?",
            "{crop} 속이 잘 안 차는 이유는 무엇인가요?",
            "{crop} {stage} 때 주의할 병해가 있나요?",
        ),
    ),
    (
        ("등숙", "성숙", "수확"),
        (
            "{crop} 수확 시기는 어떻게 판단하나요?",
            "{crop}을 거둔 뒤 어떻게 보관해야 오래가나요?",
            "{crop} 수확이 늦어지면 어떤 문제가 생기나요?",
        ),
    ),
)

#: 단계를 모를 때. 밭은 골랐지만 파종일이 없거나 단계표가 비어 있는 경우다.
_CROP_FALLBACK: tuple[str, ...] = (
    "{crop} 재배에서 가장 흔한 실패 원인은 무엇인가요?",
    "{crop}에 물은 얼마나 자주 줘야 하나요?",
    "{crop} 밭에 웃거름은 언제 주나요?",
)

#: 밭 자체를 안 골랐을 때. 작물 이름조차 없으므로 채울 자리가 없는 문장만 둔다.
_GENERIC: tuple[str, ...] = (
    "지금 심기 좋은 작물은 무엇인가요?",
    "비가 오래 안 오는데 밭에 무엇을 해야 하나요?",
    "잎에 벌레 먹은 자국이 있으면 어떻게 하나요?",
)


def _pick_templates(stage_name: str | None) -> tuple[str, ...] | None:
    """단계 이름에 맞는 템플릿 묶음. 맞는 것이 없으면 None."""
    if not stage_name:
        return None
    for keywords, templates in _STAGE_TEMPLATES:
        if any(keyword in stage_name for keyword in keywords):
            return templates
    return None


def suggest_questions(crop_name: str | None, stage_name: str | None) -> list[str]:
    """
    # summary
    지금 밭 상태에 맞는 추천 질문 3건.

    # params
    crop_name: 대표 작물 이름. 밭을 안 골랐으면 None<br>
    stage_name: 현재 생육단계 이름. 모르면 None<br>

    # returns
    질문 문자열 3개. 입력이 무엇이든 항상 3개다 — 화면이 개수를 분기하지 않게 한다.

    # examples
        suggest_questions("배추", "결구기")  -> ["배추 결구기에 물은 ...", ...]
        suggest_questions(None, None)       -> ["지금 심기 좋은 작물은 ...", ...]
    """
    if not crop_name:
        return list(_GENERIC[:SUGGESTION_COUNT])

    templates = _pick_templates(stage_name) or _CROP_FALLBACK
    # stage 가 비어 있어도 _CROP_FALLBACK 에는 {stage} 자리가 없어 그대로 채워진다.
    filled = [
        template.format(crop=crop_name, stage=stage_name or "") for template in templates
    ]
    return filled[:SUGGESTION_COUNT]
