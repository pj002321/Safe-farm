"""듀얼스택(IPv4+IPv6)으로 여는 기동 스크립트.

uvicorn 의 `--host` 로는 IPv4 와 IPv6 를 **동시에** 받을 수 없다. 실측하면 이렇다:

    uvicorn --host 0.0.0.0   127.0.0.1 OK    [::1] 실패
    uvicorn --host ::        127.0.0.1 실패   [::1] OK

커널의 net.ipv6.bindv6only 가 0 이고 새로 만든 IPv6 소켓의 IPV6_V6ONLY 기본값도
0 인데도 그렇다 — uvicorn 이 리스닝 소켓을 열면서 v6 전용으로 만들기 때문이다.

이게 문제가 되는 이유는 **두 경로가 서로 다른 프로토콜로 들어오기** 때문이다:

    Railway 사설망(*.railway.internal)   IPv6
    로컬 docker run -p                    IPv4
    플랫폼 헬스체크                       플랫폼이 정한다(우리가 못 고른다)

한쪽만 고르면 나머지가 조용히 끊긴다. 실제로 `--host 0.0.0.0` 이던 동안
Next 가 ai-service 를 부르는 `/api/map/*` 이 전부 502 였다.

그래서 소켓을 **직접 열고** IPV6_V6ONLY 를 꺼서 uvicorn 에 넘긴다. 그러면 하나의
소켓이 IPv6 와 IPv4-매핑 주소를 함께 받는다(위 실측에서 양쪽 200 확인).

⚠️ `uvicorn --host` 로 되돌리지 말 것. 되돌리는 순간 위 표의 트레이드오프가
   그대로 돌아온다. 고쳐야 하면 이 파일에서 소켓 옵션을 고친다.
"""

import os
import socket

import uvicorn

# Railway·Cloud Run 모두 PORT 를 주입한다. 8000 은 로컬 기본값일 뿐이다.
PORT = int(os.getenv("PORT", "8000"))

# 연결 대기 큐. 기본값(보통 128)이면 콜드 스타트에 몰린 요청이 거절될 수 있다.
BACKLOG = 256


def make_dualstack_socket(port: int) -> socket.socket:
    """IPv4·IPv6 를 함께 받는 리스닝 소켓.

    IPV6_V6ONLY 를 **명시적으로** 0 으로 둔다. 커널 기본값에 기대지 않는 이유는
    배포 환경마다 sysctl 이 다를 수 있고, 무엇보다 이 값이 이 파일의 존재 이유라
    코드에 드러나 있어야 하기 때문이다.
    """
    sock = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
    sock.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
    # 재배포 직후 TIME_WAIT 로 포트가 잡혀 있으면 기동이 실패한다.
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(("::", port))
    sock.listen(BACKLOG)
    return sock


def main() -> None:
    sock = make_dualstack_socket(PORT)

    # 로그에 실제 상태를 남긴다. 502 를 쫓을 때 "정말 듀얼스택으로 떴나"를
    # 배포 로그 한 줄로 가를 수 있어야 한다.
    v6only = sock.getsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY)
    print(
        f"[serve] dual-stack listen on [::]:{PORT} (IPV6_V6ONLY={v6only}) "
        f"— IPv4 와 IPv6 를 함께 받습니다",
        flush=True,
    )

    # `fd=` 로 넘기면 uvicorn 이 자기 소켓을 새로 열지 않는다.
    uvicorn.run(
        "app.main:app",
        fd=sock.fileno(),
        # 컨테이너 로그가 곧 관측 수단이다. 접근 로그를 끄면 호출이 온 사실조차 안 보인다.
        access_log=True,
    )


if __name__ == "__main__":
    main()
