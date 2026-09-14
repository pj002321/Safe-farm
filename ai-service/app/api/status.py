"""서비스 능력 조회.

무엇이 **구현됐고 무엇이 아직 아닌지**를 호출자에게 그대로 알린다.
`ai-service` 는 지금 골격이라, Next 쪽이 "리포트를 부를 수 있는가"를
매번 추측하는 대신 여기서 물어보게 한다.

이 엔드포인트가 통신 배선의 **첫 검증 지점**이기도 하다. Next 에서 이게
200 으로 돌아오면 내부망·토큰·직렬화가 전부 살아 있다는 뜻이다.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core import config
from app.core.security import require_service_token

router = APIRouter(prefix="/v1", tags=["status"])


@router.get("/status", dependencies=[Depends(require_service_token)])
def service_status() -> dict[str, object]:
    """호출자가 분기할 수 있을 만큼만 알린다.

    ⚠️ 설정 **값**을 돌려주지 않는다. 존재 여부(bool)만 준다 — DATABASE_URL 에는
    비밀번호가, OPENAI_API_KEY 에는 키가 그대로 들어 있다.
    """
    has_db = bool(config.DATABASE_URL)
    has_llm = bool(config.OPENAI_API_KEY)

    return {
        "service": "ai-service",
        "version": "0.1.0",
        # 호출자가 "지금 리포트를 요청해도 되는가"를 이 값 하나로 판단한다.
        "ready": has_db and has_llm,
        "capabilities": {
            # 아직 구현되지 않은 것을 true 로 두면 Next 가 호출했다가
            # NotImplementedError 를 500 으로 받는다. 정직하게 false 로 둔다.
            "embedding": False,
            "retrieval": False,
            "reportGeneration": False,
        },
        "config": {
            "database": has_db,
            "llm": has_llm,
            "embedModel": config.EMBED_MODEL,
            "dimension": config.DIMENSION,
        },
    }
