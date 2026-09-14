# ai-service

작물 추천 · 질의응답 AI 서버 (Python 3.10+ · LangGraph).

## 처음 한 번

1. **인터프리터 선택** — `Ctrl+Shift+P` → `Python: Select Interpreter` → 3.10 이상.
   환경 종류(conda/venv)는 자유. 3.9 면 pip 이 설치를 거부한다.
2. **`Ctrl+Shift+B`** — 선택한 인터프리터로 설치한다. 3-OS 동일.

터미널로 할 때도 같다. **`-e` 를 빼지 말 것** — 빼면 `app/`·`pipeline/` 이 sys.path 에
안 올라가서 cwd 가 `ai-service` 일 때만 import 가 풀린다.

```bash
cd ai-service && python -m pip install -e ".[dev]"
```

의존성 목록은 `pyproject.toml` 한 곳뿐이다. `requirements.txt` 를 다시 만들지 말 것.

### 등록된 작업

| 작업 | 하는 일 |
|---|---|
| `ai-service: 의존성 설치` | `pip install -e ".[dev]"` (`Ctrl+Shift+B`) |
| `ai-service: 테스트` | `pytest` |
| `ai-service: 린트` | `ruff check .` |

## 명령

```powershell
python -m pytest                          # 전체
python -m pytest tests/test_nodes.py      # 파일 하나
python -m pytest -k 반올림                 # 케이스 하나
python -m ruff check .                    # 린트
python -m ruff format .                   # 포맷
```

## 어디에 무엇을

디렉터리별 역할과 층 규칙은 `AGENTS.md` 의 Architecture 에 있다 (두 벌로 두면 갈린다).

## 아직 정해지지 않은 것

`archi_base.md` 5장 참고.
