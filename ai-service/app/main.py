"""FastAPI 진입점.

이 파일이 비어 있으면 `uvicorn app.main:app` 이 띄울 대상이 없어 컨테이너가
즉시 죽는다. Railway·Cloud Run 모두 "포트를 열지 않았다"는 오류만 보여주므로
원인을 찾기 어렵다.

설계 원칙:
    **DB 없이도 뜬다.** 라우터가 DB 를 쓰더라도 연결은 요청 시점에 열린다
    (`app/core/db.py` 의 지연 엔진). 그래서 Supabase 를 붙이기 전에도 배포해
    `/health` 로 파이프라인이 도는지 먼저 확인할 수 있다.

    **`/health` 는 DB 에 붙지 않는다.** 헬스체크가 DB 를 건드리면 DB 가 잠깐
    흔들릴 때 플랫폼이 컨테이너를 죽이고 재시작을 반복한다. DB 상태는
    `/health/db` 에서 따로 본다.
"""

from __future__ import annotations

from fastapi import FastAPI

from app.api import ask as ask_api
from app.api import crop as crop_api
from app.api import map as map_api
from app.api import status as status_api
from app.api import tasks as tasks_api
from app.api import variety as variety_api
from app.api import weather as weather_api
from app.core import config

app = FastAPI(
    title="Safe Farm AI Service",
    description="기후·위성 데이터 기반 농작물 위험 감지 및 추천",
    version="0.1.0",
    # 공개 인터넷에 열지 않는다(Next.js 서버만 호출). 그래도 문서 UI 는
    # 남겨 둔다 — 내부에서 스키마를 확인할 때 쓴다.
    docs_url="/docs",
)

# /v1/* 는 전부 서비스 토큰이 필요하다(각 라우터가 의존성으로 건다).
# /health 만 토큰 없이 열려 있다 — Railway 헬스체크가 헤더를 못 붙이기 때문이다.
app.include_router(status_api.router)
app.include_router(map_api.router)
app.include_router(ask_api.router)
app.include_router(crop_api.router)
app.include_router(variety_api.router)
app.include_router(weather_api.router)
app.include_router(tasks_api.router)

@app.get("/health")
def health() -> dict[str, object]:
    """살아 있는지만 본다. 외부 의존성을 건드리지 않는다.

    설정이 채워졌는지는 **불리언으로만** 알린다. 값 자체를 돌려주면
    DATABASE_URL 의 비밀번호와 API 키가 그대로 노출된다.
    """
    return {
        "status": "ok",
        "service": "ai-service",
        "config": {
            "database_url": bool(config.DATABASE_URL),
            "openai_api_key": bool(config.OPENAI_API_KEY),
            "openai_model": config.OPENAI_MODEL or None,
            "embed_model": config.EMBED_MODEL,
            "dimension": config.DIMENSION,
        },
    }


@app.get("/health/db")
def health_db() -> dict[str, object]:
    """DB 까지 실제로 왕복한다. 연결 설정이 맞는지 확인할 때 쓴다.

    실패해도 500 을 내지 않고 `ok: false` 와 오류 종류를 돌려준다 — 배포
    직후 "DB 만 아직 안 붙은 상태"와 "앱이 고장난 상태"를 구분해야 하기 때문이다.
    오류 메시지에 접속 문자열이 섞일 수 있어 **예외 타입만** 내보낸다.
    """
    from sqlalchemy import text

    from app.core.db import get_engine

    try:
        with get_engine().connect() as conn:
            conn.execute(text("select 1"))
        return {"ok": True}
    except Exception as exc:  # noqa: BLE001 — 종류를 가리지 않고 상태로 환원한다
        return {"ok": False, "error": type(exc).__name__}
