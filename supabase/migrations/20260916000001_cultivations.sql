-- ─────────────────────────────────────────────────────────────
-- cultivations — 밭에 심은 작물 한 건
--
-- plots.crops(text[]) 하나로는 "배추와 무를 다른 날 심었다"를 표현할 수 없다.
-- 파종일이 밭에 하나뿐이라 작물별 GDD 를 낼 수 없어서 따로 뺀다.
--
-- ⚠️ crop_variants 는 ai-service(pipeline/farm/init_farm_db.py)가 만든다.
--    그 테이블이 없으면 이 마이그레이션이 FK 에서 실패한다 — 순서 주의.
--
-- ⚠️ **RLS 3종 세트를 한 단위로 쓴다** (AGENTS.md):
--      grant → enable row level security → create policy
-- ─────────────────────────────────────────────────────────────

create table if not exists public.cultivations (
  id          uuid primary key default gen_random_uuid(),
  plot_id     uuid    not null references public.plots(id) on delete cascade,
  -- 작물이 아니라 품종을 참조한다. 게이지 분모(crop_variants.gdd_target)와
  -- 단계표(crop_stages)가 둘 다 variant_id 에 매달려 있어 crop_id 로는 못 찾는다.
  variant_id  integer not null references public.crop_variants(variant_id),

  -- 사용자가 붙인 이름. 예: "창가 상추"
  alias       text,

  -- 씨뿌린(또는 정식한) 날. **모를 수 있어서 nullable 이다.**
  -- 알면 weather_obs_daily 를 소급 조회해 GDD 를 정확히 계산한다.
  -- status 가 PLANNED 면 심을 예정일이라 미래 날짜가 들어올 수 있다.
  sowing_date date,

  -- 파종일을 모르거나 모종으로 시작했을 때, 적산을 시작할 생육 단계.
  -- 그 단계의 crop_stages.gdd_from 이 시작 GDD 가 된다 — 별도 상수를 두지 않는다.
  start_stage_order smallint,

  sowing_type text not null default 'SEED'
              check (sowing_type in ('SEED', 'SEEDLING')),

  -- PLANNED 는 "심을 건데 아직 안 심었다". sowing_date = null 로 대신하지
  -- 않는다 — 그건 "모종으로 시작해 파종일을 모름" 이라는 다른 사실이고,
  -- 한 컬럼에 두 뜻을 담으면 GDD 시작점을 못 고른다.
  status      text not null default 'GROWING'
              check (status in ('PLANNED', 'GROWING', 'HARVESTED', 'FAILED')),
  -- status 가 HARVESTED 일 때만 채운다. 언제 끝났는지 없으면 기록 가치가 없다.
  harvested_at date,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- 시작 단계는 그 품종에 실재하는 단계여야 한다. 복합 FK 로 DB 가 막는다.
  foreign key (variant_id, start_stage_order)
    references public.crop_stages (variant_id, stage_order),

  -- 둘 다 비면 적산을 시작할 지점이 없어 GDD 를 아예 못 낸다.
  -- 심기 전에는 그 지점이 없는 게 정상이라 PLANNED 는 뺀다.
  constraint ck_cultivations_gdd_origin
    check (
      status = 'PLANNED'
      or sowing_date is not null
      or start_stage_order is not null
    )
);

-- 누적 GDD 는 컬럼으로 두지 않는다. weather_obs_daily 를 읽어 조회할 때마다
-- 다시 합산한다 — 저장하면 기상 관측이 정정됐을 때 원천과 어긋난다.
-- 목록이 느려지면 그때 캐시를 넣되, 증분이 아니라 전체 재계산으로 덮어쓴다.

-- FK 에는 인덱스가 자동으로 안 생긴다. 밭 상세에서 plot_id 로 늘 조회한다.
create index if not exists cultivations_plot_id_idx
  on public.cultivations (plot_id);

-- profiles 마이그레이션에서 만든 함수를 그대로 재사용한다.
drop trigger if exists cultivations_touch_updated_at on public.cultivations;
create trigger cultivations_touch_updated_at
  before update on public.cultivations
  for each row execute function public.touch_updated_at();

-- ── RLS 3종 세트 ─────────────────────────────────────────────
-- ① grant
grant select, insert, update, delete on public.cultivations to authenticated;

-- ② enable
alter table public.cultivations enable row level security;

-- ③ policy
-- user_id 를 두지 않았으므로 plots 를 경유해 소유자를 확인한다.
-- 재배 건수가 적어 exists 로 충분하다. 느려지면 user_id 를 비정규화한다.
drop policy if exists cultivations_select_own on public.cultivations;
create policy cultivations_select_own on public.cultivations
  for select to authenticated
  using (exists (
    select 1 from public.plots p
     where p.id = cultivations.plot_id and p.user_id = auth.uid()
  ));

-- 남의 밭에 심을 수 없다.
drop policy if exists cultivations_insert_own on public.cultivations;
create policy cultivations_insert_own on public.cultivations
  for insert to authenticated
  with check (exists (
    select 1 from public.plots p
     where p.id = cultivations.plot_id and p.user_id = auth.uid()
  ));

-- using 은 고칠 행을 고르고, with check 는 고친 뒤 값을 검사한다.
-- with check 가 없으면 자기 재배를 남의 밭으로 옮길 수 있다.
drop policy if exists cultivations_update_own on public.cultivations;
create policy cultivations_update_own on public.cultivations
  for update to authenticated
  using (exists (
    select 1 from public.plots p
     where p.id = cultivations.plot_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.plots p
     where p.id = cultivations.plot_id and p.user_id = auth.uid()
  ));

-- 삭제 후에는 검사할 행이 없어 with check 를 쓰지 않는다.
drop policy if exists cultivations_delete_own on public.cultivations;
create policy cultivations_delete_own on public.cultivations
  for delete to authenticated
  using (exists (
    select 1 from public.plots p
     where p.id = cultivations.plot_id and p.user_id = auth.uid()
  ));
