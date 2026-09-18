"""순서만 정한다. 각 단계가 멱등이라 통째로 다시 돌려도 바뀐 것만 다시 만든다.

    init_doc_db ─> load_data ─> chunk ─> embed ─> verify
       테이블        CSV적재     자르기   벡터화    점검

실행: python -m pipeline.doc.run_all              # 전부
      python -m pipeline.doc.run_all chunk embed  # 골라서
"""

import sys

from pipeline.doc import chunk, embed, init_doc_db, load_data, verify

# Windows 콘솔은 기본 cp949 라서 문서 본문에 섞인 특수문자(예: verify 의 눈으로 보기
# 샘플)를 못 만나면 UnicodeEncodeError 로 죽는다. UTF-8 로 강제한다
if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

STEPS = {
    "init": init_doc_db.main, # vector DB extension
    "load": load_data.main,
    "chunk": chunk.main,
    "embed": embed.main,
    "verify": verify.main,
}


def main() -> None:
    """
    # summary
    단계를 순서대로 부른다. 이름을 주면 그 단계만 돈다. 각 단계가 멱등이라
    통째로 다시 돌려도 바뀐 것만 다시 만든다.

    # params
    없다. 단계 이름은 argv 에서 읽는다 — init, load, chunk, embed, verify<br>

    # examples
        py -3.12 -m pipeline.doc.run_all
        py -3.12 -m pipeline.doc.run_all chunk embed
    """
    names = sys.argv[1:] or list(STEPS)
    unknown = [n for n in names if n not in STEPS]
    if unknown:
        raise SystemExit(f"모르는 단계 {unknown}. 쓸 수 있는 것: {', '.join(STEPS)}")

    for name in names:
        print(f"\n{'#' * 74}\n# {name}\n{'#' * 74}")
        # 각 단계가 sys.argv 를 직접 읽는다(--full 등). 단계 이름이 새지 않게 비운다.
        argv, sys.argv = sys.argv, [sys.argv[0]]
        try:
            STEPS[name]()
        finally:
            sys.argv = argv


if __name__ == "__main__":
    main()
