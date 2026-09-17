# 작물 마스터 데이터

`master_seed_farm_db.py` 가 읽는다. `data/dummy/` 와 달리 **실측값이다.**

## 정본은 여기가 아니다

값의 정본은 `safefarm-crop-data` 레포의 `GDD계산관련/14작물_확정표.md` 다.
이 CSV 는 그 레포의 `pipeline/build.py` 가 뱉은 산출물을 복사해 둔 것이다.

**이 파일을 손으로 고치지 않는다.** 고치면 다음 갱신 때 조용히 덮인다.
값이 틀렸으면 저쪽을 고치고 다시 뽑아 온다.

    레포    https://github.com/easty00/safefarm-crop-data.git
    버전    b2e493a
    갱신    연 1회. 런타임에 농사로 API 를 부르지 않는다

## 출처

농사로 OpenAPI (농촌진흥청) — 농작업일정·품종정보·재해예방정보·주간농사정보·병해충발생정보
기준온도 일부는 Paredes et al. (2025), Agric. Water Manag. 319:109755, Table 2.

## 값 규약

- `maturity_type` 은 `EARLY`·`MID`·`LATE` 뿐이다 — crop_variants 의 CHECK 제약.
  원문의 6갈래(극조생~조중생) 접기는 build.py 가 끝낸 상태로 온다.
- `crop_stages` 의 GDD 구간은 반개구간이다 — `gdd_from` 포함, `gdd_to` 미포함.
- 출처·근거 컬럼은 없다. ORM 에 자리가 없어 떨어뜨렸다.

## ⚠ CSV 에서 행을 빼도 DB 에서는 안 지워진다

`master_seed_farm_db.py` 는 upsert 만 한다 — 자연키가 있으면 UPDATE, 없으면 INSERT.
**삭제는 없다.** CSV 에서 빠진 행이 DB 에 남는다.

⚠ **층마다 따로 남는다.** crops 를 지우면 CASCADE 로 자식이 따라가지만,
작물은 살아 있고 숙기만 바뀐 경우(상추 EARLY → MID 하나로)는 안 지워진다.
2026-09-16 에 실제로 crops 2 · crop_variants 4 · crop_stages 11 행이 남아 있었다.

CSV 를 갈아끼운 뒤에는 행 수를 맞춰 보고, 안 맞으면 위층부터 지운다.

    delete from crops where name <> all(<CSV 의 작물 목록>);
    delete from crop_variants v using crops c
      where c.crop_id = v.crop_id
        and (c.name || '/' || v.maturity_type) <> all(<CSV 의 조합 목록>);

    delete from crop_stages s using crop_variants v, crops c
      where s.variant_id = v.variant_id and v.crop_id = c.crop_id
        and (c.name || '/' || v.maturity_type || '/' || s.stage_order)
            <> all(<CSV 의 조합 목록>);

