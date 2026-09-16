-- ─────────────────────────────────────────────────────────────
-- plots 에서 작물·파종 컬럼을 걷어낸다 (→ cultivations 로 이동)
--
-- 한 밭에 배추를 8월에, 무를 9월에 심을 수 있다. 그 둘은 파종일도 누적 GDD 도
-- 다르다. plots 한 행에 `crops text[]` + `sowing_date` 하나로는 표현이 안 된다.
-- 재배 한 건 = cultivations 한 행으로 옮긴다.
--
-- ⚠️ 20260916000000_cultivations.sql 다음에 돌아야 한다.
-- ─────────────────────────────────────────────────────────────

-- 기존 행은 옮기지 않는다. `crops` 에 들어 있던 값은 화면에 박혀 있던 슬러그
-- ("cabbage", "rice", "persimmon")라 작물 마스터(crops.name = "배추")의 어느
-- 행과도 이어지지 않는다. 벼·감은 마스터에 아예 없다. 억지로 매핑하면 틀린
-- variant_id 가 남고, 그 위에 쌓는 GDD 는 전부 틀린 값이 된다.
alter table public.plots
  drop column if exists crops,
  drop column if exists sowing_date,
  drop column if exists sowing_unknown,
  drop column if exists sowing_method;
