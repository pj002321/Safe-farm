"""게시물 CSV(data/bulletins/) → 게시물 표. 마스터가 아닌 것 — 주 1회·반월·월 갱신.

master_seed_farm_db.py 와 나눈 이유: 갱신 주기가 다르다. 매주 이걸 돌린다고 마스터를
다시 읽지 않는다. 구조는 저쪽을 그대로 본떴다 — read_all · check · upsert · report.

실행:  py -m pipeline.farm.seed_bulletins            전부
       py -m pipeline.farm.seed_bulletins --check    DB 안 열고 검사만
       py -m pipeline.farm.seed_bulletins --prune    CSV 에서 사라진 행을 지우기까지
"""

import sys

from app.core.config import DATA_DIR
from app.core.db import get_engine, new_session
from app.models.farm import DisasterBulletin, PestAlert, PestBulletin, WeeklyNote
from pipeline.prep import check
from pipeline.prep.seeding import count_rows, read_all, report, require_tables
from pipeline.prep.table import prune, upsert

BULLETIN_DIR = DATA_DIR / "bulletins"
INIT_HINT = "py -m pipeline.farm.init_farm_db"

# 표 이름 → (ORM, 자연키). 병해충·재해예방 교안이 여기 한 줄씩 더한다
TABLES = {
    "weekly_notes": (WeeklyNote, ["issue_year", "issue_no", "ordinal"]),
    "pest_alerts": (
        PestAlert,
        ["issue_year", "issue_no", "crop_group", "level", "kind", "pest_name"],
    ),
    "pest_bulletins": (PestBulletin, ["issue_year", "issue_no", "ordinal"]),
    "disaster_bulletins": (DisasterBulletin, ["issue_year", "issue_month", "ordinal"]),
}
UNIQUE = [(name, key) for name, (_, key) in TABLES.items()]


def _int(v):
    return int(v) if v not in (None, "") else None


def _rows(name, data):
    """CSV 행을 ORM 컬럼 dict 로. 게시물 표는 칸 이름이 곧 컬럼이라 형 변환만 한다."""
    out = []
    for r in data[name]:
        row = dict(r)
        for k in ("issue_year", "issue_no", "ordinal", "issue_month"):
            if k in row:
                row[k] = _int(row[k])
        for k in ("crops", "crop_names", "target_crops"):
            if k in row:
                row[k] = row[k] or ""          # UNIQUE·NOT NULL 에 걸리지 않게 빈 문자열
        for k in ("period_from", "period_to"):
            if k in row:
                row[k] = row[k] or None
        out.append(row)
    return out


def load(db, data, 지우기=False):
    done = {}
    # data 에 있는 것만 넣는다 — main() 이 CSV 없는 표를 걸러낸 결과다
    for name, (model, key) in TABLES.items():
        if name not in data:
            continue
        rows = _rows(name, data)
        done[name] = upsert(db, model, rows, key)
        if 지우기:
            지움 = prune(db, model, rows, key)
            if 지움:
                print(f"  {name}: CSV 에서 사라진 {지움}행 지움")
    db.commit()
    return done


def main():
    # CSV 가 아직 없는 표는 건너뛴다. ORM·TABLES 를 먼저 등록하고 CSV 를 나중에 넣는 순서가
    # 자연스러운데(교안이 DAY2 에서 ORM, DAY1 에서 CSV 를 만든다), read_all 은 파일이 없으면
    # FileNotFoundError 로 죽어 나머지 표까지 못 넣는다.
    #
    # ⚠ 조용히 넘기지 않고 이름을 찍는다 — CSV 를 빠뜨린 것과 아직 안 만든 것은
    #   화면에서 구분되지 않으므로, 무엇이 안 들어갔는지 매번 보이게 한다
    없는것 = [n for n in TABLES if not (BULLETIN_DIR / f"{n}.csv").exists()]
    if 없는것:
        print(f"  건너뜀(CSV 없음): {', '.join(없는것)}")
    names = [n for n in TABLES if n not in 없는것]
    data = read_all(BULLETIN_DIR, names)
    if "--check" in sys.argv:
        count_rows(data, names)
        # UNIQUE 는 TABLES 전체를 담고 있다. CSV 가 없어 건너뛴 표까지 보면 KeyError 다
        check.report(check.duplicates(data, [u for u in UNIQUE if u[0] in data]))
        return
    require_tables(get_engine(), names, INIT_HINT)
    db = new_session()
    try:
        # ⚠ --prune 은 **CSV 가 그 표의 전부일 때만** 맞다. 게시물 표는 build_bulletins 가
        #   매번 전량을 다시 내므로 성립한다. 일부만 담긴 CSV 로 돌리면 나머지가 다 날아간다
        done = load(db, data, 지우기="--prune" in sys.argv)
    finally:
        db.close()
    report(data, names, done)


if __name__ == "__main__":
    main()
