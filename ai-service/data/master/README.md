# 작물 마스터 데이터

`master_seed_farm_db.py` 가 읽는다. `data/dummy/` 와 달리 **실측값이다.**

## 정본은 여기가 아니다

값의 정본은 `safefarm-crop-data` 레포의 `GDD계산관련/14작물_확정표.md` 다.
이 CSV 는 그 레포의 `pipeline/build.py` 가 뱉은 산출물을 복사해 둔 것이다.

**이 파일을 손으로 고치지 않는다.** 고치면 다음 갱신 때 조용히 덮인다.
값이 틀렸으면 저쪽을 고치고 다시 뽑아 온다.

    레포    https://github.com/easty00/safefarm-crop-data.git
    버전    723b5b4
    갱신    연 1회. 런타임에 농사로 API 를 부르지 않는다

## 출처

농사로 OpenAPI (농촌진흥청) — 농작업일정·품종정보·재해예방정보·주간농사정보·병해충발생정보
기준온도 일부는 Paredes et al. (2025), Agric. Water Manag. 319:109755, Table 2.

## 값 규약

- `maturity_type` 은 `EARLY`·`MID`·`LATE` 뿐이다 — crop_variants 의 CHECK 제약.
  원문의 6갈래(극조생~조중생) 접기는 build.py 가 끝낸 상태로 온다.
- `crop_stages` 의 GDD 구간은 반개구간이다 — `gdd_from` 포함, `gdd_to` 미포함.
- 출처·근거 컬럼은 없다. ORM 에 자리가 없어 떨어뜨렸다.
