"""plots 에 있는 격자를 grids 표로 옮긴다. 예보 적재의 전제다.

왜 필요한가:
    밭 등록(`src/app/(app)/plots/new/actions.ts`)이 `toKmaGrid(lat, lon)` 으로 nx·ny 를
    계산해 `plots.grid_x`·`grid_y` 에 넣는다. 그런데 **grids 표에는 행을 만들지 않는다.**
    화면은 grids 에서 `grid_id` 를 찾아 예보를 읽으므로(`weatherStore.findGridId`),
    grids 에 그 격자가 없으면 **예보가 영영 안 보인다.**

    `app/models/farm/grid.py` 머리말이 *"전국 격자를 미리 넣지 않고, 밭이 생길 때 필요한
    것만 추가한다"* 고 적어 뒀는데 **그 추가하는 코드가 없었다.** 이 파일이 그것이다.

    실측 2026-09-20 — 밭 23개 중 grids 에서 자기 격자를 찾는 것 **0개**.

    ⚠ 지금 grids 8행은 더미에서 갈라져 나온 예시값이다(72717a3 · 첫 줄 60,127 은
      기상청 문서의 서울 예시 격자). **매칭 0건은 버그가 아니라 맞을 이유가 없던 상태다.**
      `weather_obs_daily` 가 더미 17행이던 것과 같은 병이고, 그건 `sync_station_obs.py`
      가 고쳤다 — 그 파일이 이 작업의 선례다.

왜 지우지 않고 더하기만 하나:
    `weather_forecast.grid_id` 가 **FK CASCADE** 다. 더미 격자를 지우면 거기 붙어 있던
    예보(지금 12행)도 같이 사라진다. 잃을 것이 없어 보여도, **되돌리기 쉬운 쪽**을 고른다 —
    잘못되면 `delete from grids where nx in (…)` 한 줄로 돌아올 수 있어야 한다.

왜 프런트에서 안 하나:
    **권한이 없다.** `20260918010000_table_grants_tighten.sql` 이 anon·authenticated 에
    grids **select 만** 준다. insert 는 service role 인 ai-service 만 할 수 있다.

⚠ **API 호출이 0회다.** 이미 `plots` 에 있는 값을 옮긴다.

⚠ **이것만으로는 예보가 안 보인다.** `weather_forecast` 가 여전히 비어 있어
  `listForecast` 는 빈 배열을 준다. 달라지는 것은 `findGridId` 가 `null` 을 그만
  돌려준다는 것뿐이다 — **적재 배치가 들어올 자리를 여는 일이다.**
  (도달 예측은 `weatherStore.loadForecastTemps` 가 ai-service 를 보게 바뀌어 이미 산다.)

실행:
    py -m pipeline.farm.sync_plot_grids
    py -m pipeline.farm.sync_plot_grids --check    # 넣지 않고 무엇이 들어갈지만 본다
"""

from __future__ import annotations

import sys

from sqlalchemy import text

from app.core.db import new_session
from app.models.farm.grid import Grid
from pipeline.prep.table import upsert

#: 기상청 단기예보 격자의 유효 범위. `grids` 의 CHECK 제약과 **같은 값**이다.
#:
#: ⚠ 여기서 한 번 더 거르는 까닭 — 제약에 걸리면 배치가 통째로 죽는다. 밭 하나가
#:   이상해서 나머지 격자가 안 들어가면 안 된다. 거른 것은 아래에서 이름을 찍어 알린다.
NX_RANGE = (1, 149)
NY_RANGE = (1, 253)


def _in_range(nx: int, ny: int) -> bool:
    return NX_RANGE[0] <= nx <= NX_RANGE[1] and NY_RANGE[0] <= ny <= NY_RANGE[1]


def main() -> None:
    """
    # summary
    살아 있는 밭의 격자를 모아 `grids` 에 없으면 넣는다.

    ⚠ `upsert` 의 충돌 키가 **`["nx", "ny"]`** 다. `grid_id` 는 Identity 라 키로 쓰면
      매번 새 행이 된다. 기존 시더도 같은 키를 쓰므로(`master_seed_farm_db`)
      **재시딩해도 `grid_id` 가 안 바뀐다** — 예보가 엉뚱한 격자에 붙는 일은 없다.

    # returns
    없음. 무엇이 들어갔는지 화면에 찍는다

    # examples
        py -m pipeline.farm.sync_plot_grids --check
        -> 밭 23개 · 격자 10칸 · 이미 있는 것 0칸 · 새로 넣을 것 10칸
    """
    볼_뿐 = "--check" in sys.argv

    db = new_session()
    try:
        rows = db.execute(
            text(
                """
                select distinct grid_x, grid_y
                  from plots
                 where deleted_at is null
                   and grid_x is not null
                   and grid_y is not null
                 order by grid_x, grid_y
                """
            )
        ).fetchall()

        밭수 = db.execute(
            text("select count(*) from plots where deleted_at is null")
        ).scalar()

        쓸것 = [{"nx": int(x), "ny": int(y)} for x, y in rows if _in_range(int(x), int(y))]
        걸러짐 = [(int(x), int(y)) for x, y in rows if not _in_range(int(x), int(y))]

        있던것 = {
            (int(a), int(b))
            for a, b in db.execute(text("select nx, ny from grids")).fetchall()
        }
        새것 = [g for g in 쓸것 if (g["nx"], g["ny"]) not in 있던것]

        print(f"밭 {밭수}개 · 격자 {len(쓸것)}칸 · 이미 있는 것 "
              f"{len(쓸것) - len(새것)}칸 · 새로 넣을 것 {len(새것)}칸")
        if 걸러짐:
            # 범위 밖이면 좌표가 잘못됐다는 뜻이다. 조용히 버리면 그 밭만 영영 예보가 없다
            print(f"  ⚠ 격자 범위 밖이라 뺀 것 {len(걸러짐)}칸: {걸러짐}")
        if 새것:
            print(f"  새 격자: {[(g['nx'], g['ny']) for g in 새것]}")

        if 볼_뿐:
            print("  --check 라 넣지 않았습니다")
            return
        if not 쓸것:
            print("  넣을 것이 없습니다")
            return

        n = upsert(db, Grid, 쓸것, ["nx", "ny"])
        db.commit()

        총 = db.execute(text("select count(*) from grids")).scalar()
        맞은밭 = db.execute(
            text(
                """
                select count(*)
                  from plots p
                  join grids g on g.nx = p.grid_x and g.ny = p.grid_y
                 where p.deleted_at is null
                """
            )
        ).scalar()
        print(f"  grids {n}행 반영 → 표 {총}행 · 격자를 찾는 밭 {맞은밭}/{밭수}개")
    finally:
        db.close()


if __name__ == "__main__":
    main()
