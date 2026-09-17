"""chunks.embedding 을 vector → halfvec 으로 옮긴다. 일회성이지만 멱등하다.

    py -m pipeline.doc.migrate_halfvec

왜 init_doc_db 가 못 하나:
    저건 create_all(checkfirst=True) 라 **없는 것만 만든다.** 이미 있는 컬럼의 타입은
    그대로 둔다. 그래서 models/chunk.py 를 HALFVEC 로 고쳐도 기존 DB 는 vector 로 남는다.

왜 run_all 의 단계로 넣지 않나:
    한 번 옮기면 끝이고, load·chunk·embed 와 달리 원본이 바뀐다고 다시 돌 일이 없다.
    STEPS 에 넣으면 매 색인마다 타입을 확인하는 군더더기가 된다.
"""

from sqlalchemy import text

from app.core.config import DIMENSION
from app.core.db import get_engine

INDEX = "ix_chunks_embedding_hnsw"


def main() -> None:
    """
    # summary
    embedding 컬럼 타입을 halfvec 으로 바꾸고 HNSW 인덱스를 새 연산자 클래스로 다시 만든다.
    값은 캐스팅으로 보존되므로 재임베딩이 필요 없다. 이미 halfvec 이면 아무것도 안 한다.

    # params
    없다. 차원은 app.core.config 의 DIMENSION 에서 읽는다<br>
    """
    engine = get_engine()
    with engine.begin() as con:
        현재 = con.execute(
            text(
                "select atttypid::regtype::text from pg_attribute "
                "where attrelid = 'chunks'::regclass and attname = 'embedding'"
            )
        ).scalar()
        if 현재 == "halfvec":
            print("이미 halfvec 이다. 할 일 없음")
            return

        print(f"{현재} -> halfvec({DIMENSION}) 로 옮긴다")
        # ① 인덱스가 컬럼을 붙들고 있다. 떨어뜨리지 않으면 ALTER 가 거부된다
        con.execute(text(f"drop index if exists {INDEX}"))
        # ② 값을 유지한 채 타입만. using 절이 캐스팅한다
        con.execute(
            text(
                f"alter table chunks alter column embedding "
                f"type halfvec({DIMENSION}) using embedding::halfvec({DIMENSION})"
            )
        )
        # ③ 연산자 클래스도 halfvec_ 쪽으로. vector_cosine_ops 로 두면 생성이 거부된다.
        #    29,000조각이라 몇 분 걸린다
        con.execute(
            text(
                f"create index {INDEX} on chunks "
                f"using hnsw (embedding halfvec_cosine_ops)"
            )
        )
    print("완료")


if __name__ == "__main__":
    main()
