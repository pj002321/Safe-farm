"""기상특보 스냅샷 적재 엔드포인트.

**왜 적재가 따로 필요한가.** 특보 조회(`/v1/weather/plot` 의 alert,
`/v1/map/sigungu-warn`)는 KMA 를 실시간으로 부르지 않는다. 둘 다
`warn_region._latest_active_alerts` 를 거치는데, 그 함수는 `official_alerts`
표에서 **가장 최근 스냅샷 하나**(`fetched_at` 최댓값)를 읽을 뿐이다. 그래서 이
표를 채우는 것이 없으면 조회 API 는 옛 스냅샷을 영원히 돌려준다 — 해제된 특보가
계속 떠 있고, 새로 뜬 특보는 보이지 않는다.

KMA 를 실제로 부르는 `fetch_warnings` 의 호출부는 원래 `pipeline/` 안뿐이었고
(run_all.py 수동 실행), 실행 중인 서비스에는 한 곳도 없었다. 이 모듈이 그 자리다.

주기는 30분(Supabase pg_cron → Next /api/cron/alerts). 특보는 수시로 발효·해제
되므로 하루 한 번으로는 늦다.

⚠️ `official_alerts` 는 append-only 다. 적재 주기를 올리면 표가 계속 커지므로
   보존 기간 정리(cron 잡 `alerts-prune`)와 `fetched_at` 인덱스가 함께 있어야
   한다. 셋은 한 단위다 — 하나만 빼면 며칠 뒤 홈 진입이 느려진다.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import KMA_API_KEY
from app.core.db import get_db
from app.core.security import require_service_token
from pipeline.load_data import load_alerts

router = APIRouter(prefix="/v1/alerts", tags=["alerts"])


@router.post("/ingest", dependencies=[Depends(require_service_token)])
def ingest(db: Session = Depends(get_db)) -> dict:
    """KMA 특보현황을 한 번 받아 `official_alerts` 에 스냅샷으로 append 한다.

    0건은 정상이다 — 전국에 발효 중인 특보가 없으면 그렇다. 그 경우에도 조회는
    직전 스냅샷을 계속 보므로, 신선도 판단은 응답의 `asOf` 로 한다.
    """
    if not KMA_API_KEY:
        # 키가 없으면 조용히 0건으로 끝내지 않는다. "성공했는데 계속 비어 있는"
        # 상태가 가장 찾기 어렵다.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="KMA_API_KEY 가 설정되지 않았습니다.",
        )

    return {"inserted": load_alerts(db, KMA_API_KEY)}
