"""순서만 정한다. 각 단계가 멱등이라 통째로 다시 돌려도 바뀐 것만 다시 들어간다.

    init_farm_db ─> master_seed_farm_db ─> seed_farm_db
       테이블          마스터 적재           런타임 더미 적재

마스터가 먼저다. 런타임 행은 grid_id·terms_id 를 이미 들어간 마스터에서 조회해 채운다.

적재 전에 CSV 검사를 전부 먼저 돌린다. 마스터만 들어간 어중간한 상태를 만들지 않으려고
순서를 이렇게 잡았다 — 검사는 DB 에 붙지 않으므로 먼저 몰아서 돌려도 값이 싸다.

실행: python -m pipeline.farm.run_all              # 전부
      python -m pipeline.farm.run_all master seed  # 골라서
"""

import sys

from pipeline.farm import init_farm_db, master_seed_farm_db, seed_farm_db

STEPS = {
    "init": init_farm_db,
    "master": master_seed_farm_db,
    "seed": seed_farm_db,
}

# --check 를 받는 단계. init 은 CSV 를 읽지 않으므로 미리 볼 것이 없다
CHECKABLE = {"master", "seed"}


def run(name: str, *args: str) -> None:
    """
    # summary
    단계 하나를 부른다. 각 단계가 sys.argv 를 직접 읽으므로 옵션을 거기에 맞춰 넣고,
    끝나면 되돌린다. 단계 이름이 그대로 새면 옵션으로 잘못 읽힌다.

    # params
    name: STEPS 의 키
    args: 그 단계에 넘길 옵션

    # examples
        run("master", "--check")
    """
    title = f"{name} {' '.join(args)}".strip()
    print(f"\n{'#' * 74}\n# {title}\n{'#' * 74}")
    argv, sys.argv = sys.argv, [sys.argv[0], *args]
    try:
        STEPS[name].main()
    finally:
        sys.argv = argv


def main() -> None:
    names = sys.argv[1:] or list(STEPS)
    unknown = [n for n in names if n not in STEPS]
    if unknown:
        raise SystemExit(f"모르는 단계 {unknown}. 쓸 수 있는 것: {', '.join(STEPS)}")

    # 1단계 — CSV 끼리 자연키가 맞는지만 본다. 어긋나면 여기서 멈춘다.
    # 어긋난 것을 첫 하나가 아니라 전부 찍어주는 것이 이 단계의 값이다.
    for name in names:
        if name in CHECKABLE:
            run(name, "--check")

    # 2단계 — 실제 적재
    for name in names:
        run(name)


if __name__ == "__main__":
    main()
