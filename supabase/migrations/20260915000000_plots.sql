-- ─────────────────────────────────────────────────────────────
-- plots — 등록된 텃밭
--
-- ⚠️ **RLS 3종 세트를 한 단위로 쓴다** (AGENTS.md):
--      grant → enable row level security → create policy
-- ─────────────────────────────────────────────────────────────

create table if not exists public.plots (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  name           text,
  area_m2        numeric,
  latitude       double precision not null,
  longitude      double precision not null,
  -- 기상청 동네예보 5km 격자. 서버가 위경도로 계산해 넣는다
  -- (features/monitoring/domain/kmaGrid.ts, 순수 함수).
  grid_x         integer not null,
  grid_y         integer not null,
  -- 행정구역(법정동) 코드·이름. 이후 위성·통계 조회의 키다.
  region_code    text not null,
  region_ko      text not null,
  address_ko     text not null,
  crops          text[] not null default '{}',
  sowing_date    date,
  sowing_unknown boolean not null default false,
  sowing_method  text not null default 'seed' check (sowing_method in ('seed', 'seedling')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- profiles 마이그레이션에서 만든 함수를 그대로 재사용한다.
drop trigger if exists plots_touch_updated_at on public.plots;
create trigger plots_touch_updated_at
  before update on public.plots
  for each row execute function public.touch_updated_at();

-- ── RLS 3종 세트 ─────────────────────────────────────────────
-- ① grant
grant select, insert on public.plots to authenticated;

-- ② enable
alter table public.plots enable row level security;

-- ③ policy
-- 자기 밭만 본다.
drop policy if exists plots_select_own on public.plots;
create policy plots_select_own on public.plots
  for select to authenticated
  using (auth.uid() = user_id);

-- 자기 이름으로만 등록한다.
drop policy if exists plots_insert_own on public.plots;
create policy plots_insert_own on public.plots
  for insert to authenticated
  with check (auth.uid() = user_id);

-- update·delete 는 아직 화면이 없다. grant 를 안 줬으므로 정책도 만들지 않는다
-- (수정·삭제 화면이 생기는 시점에 같이 추가할 것).
