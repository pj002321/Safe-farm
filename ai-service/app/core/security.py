"""서비스 간 호출 인증.

이 서비스는 **공개 도메인을 붙이지 않는다.** Next.js 서버만 Railway 내부망
(`<서비스명>.railway.internal`)으로 호출한다. 그런데 내부망만 믿지 않는다:

  - 공개 도메인을 실수로 한 번 붙이는 순간 LLM 엔드포인트가 인터넷에 열린다.
    그때 남는 방어선이 이것 하나다.
  - 같은 Railway 프로젝트에 나중에 다른 서비스가 생기면 그것도 내부망 안이다.

비밀은 `AI_SERVICE_TOKEN` 환경변수로 양쪽에 같은 값을 넣는다. JWT 가 아니라
단순 공유 비밀인 이유는 호출자가 우리 서버 하나뿐이라 발급·폐기 절차가 필요
없기 때문이다. 늘어나면 그때 바꾼다.

⚠️ 비교에 `==` 를 쓰지 않는다. 문자열 비교는 첫 불일치에서 멈춰 응답 시간이
   달라지고, 그 차이로 토큰을 한 글자씩 알아낼 수 있다(timing attack).
   `secrets.compare_digest` 는 길이가 같으면 항상 같은 시간이 걸린다.
"""

from __future__ import annotations

import os
import secrets

from fastapi import Header, HTTPException, status

#: 호출자가 이 헤더에 토큰을 담는다. Authorization 을 쓰지 않는 이유는
#: 나중에 사용자 토큰을 함께 실어야 할 때 자리가 겹치지 않게 하려는 것이다.
SERVICE_TOKEN_HEADER = "X-Service-Token"


def _expected_token() -> str | None:
    token = os.getenv("AI_SERVICE_TOKEN", "").strip()
    return token or None


async def require_service_token(
    x_service_token: str | None = Header(default=None),
) -> None:
    """서비스 토큰을 검사하는 FastAPI 의존성.

    토큰이 **설정되지 않았으면 거부한다.** "설정이 없으면 통과"로 만들면
    환경변수를 빠뜨린 배포가 조용히 무인증으로 열린다 — 가장 위험한 기본값이다.
    """
    expected = _expected_token()

    if expected is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI_SERVICE_TOKEN 이 설정되지 않았습니다.",
        )

    if x_service_token is None or not secrets.compare_digest(
        x_service_token, expected
    ):
        # 왜 틀렸는지 알려주지 않는다(헤더 없음 vs 값 불일치). 구분해서 주면
        # 공격자가 탐색 범위를 좁힐 수 있다.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="인증되지 않은 호출입니다.",
        )
