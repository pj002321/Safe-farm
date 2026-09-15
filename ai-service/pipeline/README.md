# pipeline

CSV·DB·기상청 API → 개발 DB 적재와 임베딩 색인.

farm·doc 은 멱등이라 다시 돌려도 바뀐 것만 반영된다. KMA 수집은 아니다(아래 참고).

실행은 `ai-service/` 에서 한다. 한글이 깨지면 `PYTHONIOENCODING=utf-8` 를 앞에 붙인다.

## 순서

farm 이 먼저, doc 이 나중이다. doc 이 `crop_stages` 를 읽어 문서를 만든다.

```bash
py -3.12 -m pipeline.farm.run_all    # 테이블 + 더미 데이터
py -3.12 -m pipeline.doc.run_all     # 문서 + 조각 + 벡터
```

단계를 골라 돌릴 수도 있다.

```bash
py -3.12 -m pipeline.farm.run_all master seed
py -3.12 -m pipeline.doc.run_all chunk embed
```

KMA 수집(`pipeline.run_all`)은 이 둘과 겹치는 테이블이 없어 따로 돈다.

## pipeline.farm — 농장 데이터

`init → master → seed`. `run_all` 은 적재 전에 `--check` 를 먼저 몰아 돌린다.
CSV 자연키가 어긋나면 DB 에 손대기 전에 멈춘다.

| 단계 | 대상 테이블 | 쓰는 방식 |
|---|---|---|
| `init` | FarmBase 전체 − 회원·약관·텃밭 계열 | CREATE TABLE 만. 데이터는 안 건드림 |
| `master` | crops · crop_variants · crop_stages · grids · stations | upsert |
| `seed` | weather_forecast · weather_obs_daily | upsert |

- 원본은 `data/dummy/*.csv`. 파일 이름이 테이블 이름이다.
- **upsert** — 자연키가 이미 있으면 UPDATE, 없으면 INSERT. **삭제는 없다.**
  CSV 에서 행을 지워도 DB 에는 남는다.
- 자연키는 테이블마다 다르다 — `crops.name`, `crop_variants.(crop_id, maturity_type)`,
  `crop_stages.(variant_id, stage_order)`.
- `crop_id`·`variant_id` 같은 identity 값은 CSV 에 없다. 부모를 넣고 flush 한 뒤
  조회해서 자식 행에 채운다. 그래서 CSV 는 `crop_name` 같은 자연키로 부모를 가리킨다.
- `master` 가 먼저다. `seed` 는 `grid_id` 를 마스터에서 조회하므로 비어 있으면 멈춘다.
- `profiles`·`plots`·`terms`·`user_agreements` 는 여기서 만들지도 넣지도 않는다.
  쓰기는 Next.js 몫이고, ai-service 는 필요한 값을 요청으로 받는다. ORM 정의는
  남아 있지만 파이프라인 대상에서 빠진다.

| 명령 | 하는 일 |
|---|---|
| `init_farm_db --sql` | DB 에 붙지 않고 CREATE 문만 출력 |
| `init_farm_db --drop` | 지우고 다시 만든다. **데이터도 같이 없어진다** |
| `master_seed_farm_db --check` | DB 없이 CSV 자연키만 검사 |
| `seed_farm_db --check` | 위와 같다 |

## pipeline.doc — 임베딩 색인

`init → load → chunk → embed → verify`.

| 단계 | 대상 | 쓰는 방식 |
|---|---|---|
| `init` | documents · chunks | pgvector 확장 + CREATE TABLE |
| `load` | documents | INSERT / UPDATE |
| `chunk` | chunks | INSERT |
| `embed` | chunks.embedding | UPDATE |
| `verify` | 없음 | 읽기만 |

### load

`sources.py` 의 쿼리 결과 한 행이 문서 한 건이다. 지금은 `crop_stage` 소스 하나뿐이고
`crops → crop_variants → crop_stages` 를 INNER JOIN 한다.
**단계가 없는 품종은 문서도 생기지 않는다.**

행마다 `(source, external_id)` 로 기존 문서를 찾은 뒤 갈린다.

| 상황 | 하는 일 | 출력 |
|---|---|---|
| 기존 문서 없음 | INSERT | `새로` |
| `content_hash` 다름 | UPDATE + **그 문서의 조각 전부 DELETE** | `갱신` |
| `content_hash` 같음 | `title`·`meta` 만 UPDATE | `그대로` |
| 본문이 비었음 | 아무것도 안 함 | `본문없음` |

- `external_id` — `crop_stages.(variant_id, stage_order)` 를 `':'` 로 이은 값(`'1:1'`).
  이름이 아니라 번호라서 `crops.name` 이 바뀌어도 같은 행으로 찾는다.
- `content_hash` — `content` 만 해시한다. `meta` 만 바뀌면 재임베딩하지 않는다.
- 조인 부모(`crops.name` 등)가 바뀌면 그 부모에 딸린 문서가 전부 `갱신` 이 된다.

### chunk

조각이 하나도 없는 문서만 자른다. `load` 가 바뀐 문서의 조각을 지워두므로
이 조건 하나로 새 문서와 바뀐 문서가 모두 잡힌다.

`--rebuild` 는 전부 지우고 다시 자른다 — 청킹 규칙(`CHUNK_SIZE` 등)을 바꿨을 때만.

**`load` 만 돌리고 멈추지 말 것.** 바뀐 문서가 조각 0인 채로 남아 검색에서 빠진다.

### embed

`embedding IS NULL` 인 조각만 채운다. 배치마다 commit 하므로 끊겨도 이어서 한다.

**돈이 나가는 단계다.** `.env.local` 에 `OPENAI_API_KEY` 가 있어야 한다.
`--full` 은 전부 NULL 로 지우고 다시 만든다 — 임베딩 모델을 바꿨을 때만 쓴다.

### verify

개수·차원·토큰을 점검하고 예시 질문으로 검색해 본다. 쓰기는 하지 않는다.
검색 결과가 엉뚱해도 "이상 없음" 이 나올 수 있다 — 구조 점검이지 품질 점검이 아니다.

## pipeline 최상위 — KMA 수집

기상청 API 허브에서 받아 적재한다. `.env.local` 에 `KMA_API_KEY` 가 있어야 한다.

```bash
py -3.12 -m pipeline.run_all --plot-id plot_sangju --stn 137 \
    --lat 36.4084 --lon 128.1574 --tm1 20260401 --tm2 20260913
```

| 테이블 | 쓰는 방식 | 언제 |
|---|---|---|
| `weather_daily` | upsert — `(plot_id, date, source)` | 항상 |
| `official_alerts` | **append** — 특보현황 스냅샷 | 항상 |
| `normals` | upsert — `(station, month, day, source)` | `--skip-normals` 안 줬을 때 |
| `disaster_rules` | upsert | `--solar-term` 줬을 때만 |

- `official_alerts` 만 멱등이 아니다. 두 번 돌리면 같은 특보가 두 줄 쌓인다.
- `--plot-id`·`--stn`·`--lat`·`--lon` 은 텃밭 등록 플로우가 아직 없어 직접 받는다.
- `--skip-lst` — 천리안 LST(서리 판정용) 호출 생략. 날짜마다 한 번씩 불러 느리다.
- `pipeline.preview` 는 DB 에 안 붙고 fetch 결과만 출력한다. 키·응답 확인용.

## pipeline.prep — 공용 헬퍼

`schema.py`(DDL) · `table.py`(CSV 읽기·upsert) · `seeding.py`(검사·보고).
farm 과 doc 양쪽이 쓴다. 직접 실행하는 파일은 없다.
