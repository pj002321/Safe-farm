"""farm 테이블 전용 선언적 Base.

app.core.db.Base 와 분리한 이유: pipeline/doc/init_doc_db.py 가 그쪽 Base 로 create_all() 을
돌린다. 같은 Base 를 쓰면 문서 쪽을 만들 때 이 테이블들까지 딸려 만들어진다.
farm 테이블은 pipeline/farm/init_farm_db.py 가 따로 만든다.
"""

from sqlalchemy.orm import declarative_base

FarmBase = declarative_base()
