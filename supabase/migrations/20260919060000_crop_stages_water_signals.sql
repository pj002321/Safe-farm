-- crop_stages 에 물·재해 신호 셋을 담는다.
--
-- 까닭: `water_need_mm` 이 428행 내내 0건이고 원천이 없다. 그 칸 하나가 비어서
-- `task_rules.py` 의 물 규칙이 `water_need_mm is not None` 에서 막혀 **할 일 카드가
-- 영영 0건**이었다. 필요량(mm)을 억지로 지어내는 대신 **시기**를 싣고, "지금 마른가" 는
-- 기상(최근 강수 − 증발산 · 예보)이 대게 한다.
--
-- 채워져 오는 값 (crop-data 2026-09-19 산출, crop_stages.csv 466행 기준)
--     irrigate_needed  true 122행 / 47작물
--     stage_tasks      채운 행 222   웃거름 68 · 김매기 66 · 배수 64 · 방제 59 · 물주기 29 …
--     stage_hazards    채운 행 233   가뭄 108 · 과습 104 · 저온 57 · 고온 36 · 바람 34 …
--
-- ⚠ `water_need_mm` 은 **지우지 않는다.** crop-data 의 CSV 계약 헤더에 남아 있어
--    여기서 빼면 저쪽 `verify.헤더()` 가 터진다. 자료를 나중에 찾으면 되살릴 자리다.
-- ⚠ `crop_stages` 는 이 저장소에 CREATE 문이 없다 — ORM `create_all` 로 생겼다.
--    `create_all(checkfirst=True)` 는 이미 있는 표를 안 고치므로 ALTER 가 유일한 경로다.
-- ⚠ `app/models/farm/crop_stage.py` 의 Column 셋과 **같이** 가야 한다. 한쪽만 올라가면
--    모델엔 있고 DB 엔 없어 첫 SELECT 에서 UndefinedColumn 으로 터진다.
-- ⚠ `irrigate_needed` 는 기존 428행이 있으므로 NOT NULL 에 default 를 같이 준다
--    (`fertilize_needed` 와 같은 꼴).
--
-- 인계: 이 표는 RLS 가 꺼져 있고 anon 쓰기 권한이 남아 있다(전수조사 §1-1 의 14개 중 하나).
--       권한은 표 단위라 새 칸에 따로 GRANT 할 것은 없다. 표 자체의 정리는 별건이다.

alter table public.crop_stages
    add column if not exists irrigate_needed boolean not null default false,
    add column if not exists stage_tasks     text,
    add column if not exists stage_hazards   text;

comment on column public.crop_stages.water_need_mm is
    '영영 빈 칸(2026-09-19). 원천이 없어 채우지 않는다. irrigate_needed 와 기상 판정이 대신한다.';
comment on column public.crop_stages.irrigate_needed is
    '이 시기에 물이 중요한가. 필요량이 아니라 시기다.';
comment on column public.crop_stages.stage_tasks is
    '이 단계의 농작업 갈래를 쉼표로 이은 것 — 웃거름,김매기,물주기';
comment on column public.crop_stages.stage_hazards is
    '이 단계에 조심할 재해 갈래를 쉼표로 이은 것 — 가뭄,과습,저온. crop_disaster_rules(임계값)와 다른 층이다.';
