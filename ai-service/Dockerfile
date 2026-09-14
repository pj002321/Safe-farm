# syntax=docker/dockerfile:1
#
# ─────────────────────────────────────────────────────────────
# Safe Farm AI — ai-service (FastAPI)
#
# Railway 는 서비스의 Root Directory 를 `/ai-service` 로 잡으면 이 Dockerfile 을
# 자동으로 찾아 쓴다(빌드 로그에 `Using detected Dockerfile!`). Nixpacks/Railpack
# 자동 감지에 맡기지 않는 이유는, 그 경우 파이썬 버전과 실행 명령이 플랫폼 기본값에
# 묶여서 로컬과 배포가 달라지기 때문이다.
#
# ⚠️ 이 서비스는 **공개하지 않는다.** LLM 을 호출하므로 공개 인터넷에 열면
#    남이 우리 OpenAI 요금을 쓴다. Next.js 서버에서만 호출한다.
# ─────────────────────────────────────────────────────────────

FROM python:3.12-slim

# 파이썬이 .pyc 를 남기지 않고, 로그를 버퍼링하지 않게 한다.
# 버퍼링을 끄지 않으면 컨테이너가 죽을 때 마지막 로그가 사라져 원인을 못 찾는다.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# 의존성 선언은 **pyproject.toml 한 곳뿐**이다. requirements.txt 를 다시 만들지
# 말 것 — 두 벌이 되는 순간 한쪽에만 추가되고, 둘 다 설치해야 도는 상태로 돌아간다
# (pyproject.toml 의 주석과 같은 이야기다).
#
# 소스를 먼저 넣고 설치한다. setuptools 가 app/·pipeline/ 을 찾아야 하기 때문이다
# ([tool.setuptools.packages.find]). 의존성만 따로 캐시하던 레이어는 그래서 포기했다
# — 캐시보다 "빌드가 실제로 되는 것"이 먼저다.
#
# `-e` 를 빼지 말 것. 빼면 app/·pipeline/ 이 sys.path 에 올라가지 않아 cwd 가
# /app 일 때만 import 가 풀린다(pyproject.toml 주석 참고).
COPY . .
RUN pip install --no-cache-dir -e .

# root 로 돌리지 않는다.
RUN useradd --create-home --uid 1001 appuser && chown -R appuser:appuser /app
USER appuser

# Railway·Cloud Run 모두 PORT 를 주입한다. 8000 은 로컬 기본값일 뿐이다.
ENV PORT=8000
EXPOSE 8000

# ⚠️ `--host 0.0.0.0` 이다. 루프백에만 붙으면 플랫폼 헬스체크가 전부 실패한다
#    — "시작은 됐는데 죽는" 증상의 대표적 원인이다.
#
#    `::` 로 바꿔 듀얼스택을 노리지 말 것. 실측해 보면 uvicorn 의 IPv6 소켓이
#    **IPv4 를 받지 않는다**(컨테이너 안에서 [::1] 은 200, 127.0.0.1 은 실패).
#    소켓의 IPV6_V6ONLY 기본값이 0 인데도 그렇다. 한 번 시도했다가 되돌렸다.
#    Railway 내부 DNS 는 IPv4·IPv6 양쪽으로 해석되므로 0.0.0.0 으로 충분하다.
#
# ⚠️ sh -c 로 감싸는 이유는 $PORT 를 셸이 풀어야 하기 때문이다. exec 형태로
#    쓰면 문자열 "$PORT" 가 그대로 전달돼 uvicorn 이 포트 파싱에 실패한다.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
