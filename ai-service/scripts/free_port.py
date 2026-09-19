"""개발 서버 포트를 점유 중인 프로세스를 정리한다.

옛 uvicorn(다른 venv 로 뜬 것 포함)이 재시작 없이 포트를 물고 있으면, 새로
띄운 서버가 아니라 그 옛 프로세스가 계속 응답해 코드를 고쳐도 반영이 안 된
것처럼 보인다(2026-09-20 실측: miniconda 로 뜬 uvicorn 이 .venv 서버 대신
포트를 물고 있었음). --reload 로 다시 띄우기 전에 항상 비운다.
"""

from __future__ import annotations

import subprocess
import sys

PORT = 8000


def free_port(port: int = PORT) -> None:
    if sys.platform == "win32":
        out = subprocess.run(
            ["netstat", "-ano", "-p", "TCP"], capture_output=True, text=True
        ).stdout
        pids = {
            line.split()[-1]
            for line in out.splitlines()
            if f":{port} " in line and "LISTENING" in line
        }
        for pid in pids:
            subprocess.run(["taskkill", "/PID", pid, "/F"], capture_output=True)
    else:
        out = subprocess.run(
            ["lsof", "-ti", f":{port}"], capture_output=True, text=True
        ).stdout
        for pid in out.split():
            subprocess.run(["kill", "-9", pid], capture_output=True)


if __name__ == "__main__":
    free_port(int(sys.argv[1]) if len(sys.argv) > 1 else PORT)
