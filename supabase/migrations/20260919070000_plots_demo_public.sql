-- ─────────────────────────────────────────────────────────────
-- plots.is_demo — 로그인 없이 보여줄 데모 밭 한 곳
--
-- 랜딩 페이지 `#today` 섹션이 실측·계산값을 보여주려면 실제 plots/cultivations
-- 행을 읽어야 하는데, 두 표 모두 RLS 가 `auth.uid() = user_id` (또는 그걸 경유)
-- 로 걸려 있어 로그인 없는 방문자는 한 행도 못 본다. `is_demo` 로 표시한 행만
-- anon 에게 별도 정책으로 열어준다 — 기존 "자기 것만" 정책(plots_select_own ·
-- cultivations_select_own)은 그대로 둔다.
--
-- 데모 계정·밭·재배 행 자체는 이 마이그레이션이 만들지 않는다. 스키마와 시딩은
-- 성격이 달라서다 — 시딩은 `scripts/seed-demo-plot.mjs` 가 한다.
-- ─────────────────────────────────────────────────────────────

alter table public.plots
  add column if not exists is_demo boolean not null default false;

-- 데모 밭은 하나여야 한다. 랜딩이 "그 데모 밭"을 고르는 기준이 is_demo = true
-- 뿐이라, 두 개가 되면 화면이 어느 쪽을 보여줄지 코드가 다시 골라야 한다.
create unique index if not exists plots_one_demo_idx
  on public.plots (is_demo)
  where is_demo;

-- ── plots: 데모 밭 공개 읽기 ───────────────────────────────────
grant select on public.plots to anon;

drop policy if exists plots_select_demo on public.plots;
create policy plots_select_demo on public.plots
  for select to anon, authenticated
  using (is_demo = true);

-- ── cultivations: 데모 밭에 심은 것도 같이 연다 ─────────────────
grant select on public.cultivations to anon;

drop policy if exists cultivations_select_demo on public.cultivations;
create policy cultivations_select_demo on public.cultivations
  for select to anon, authenticated
  using (exists (
    select 1 from public.plots p
     where p.id = cultivations.plot_id and p.is_demo = true
  ));
