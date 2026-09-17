-- ─────────────────────────────────────────────────────────────
-- plot_tasks — 삭제 권한
--
-- 20260916010000_plot_tasks.sql 은 select·update(done, done_at) 만 줬다.
-- plot_tasks.plot_id 는 plots(id) 를 on delete cascade 로 참조하는데, delete
-- grant 가 없으면 밭을 지울 때 이 cascade 가 권한 오류로 막힌다
-- (features/plots/plotStore.ts 의 deletePlot 이 cascade 를 타지 않고 먼저
-- 직접 지우도록 바꿔도, 그 직접 delete 자체에 이 grant 가 필요하다).
--
-- ⚠️ RLS 3종 세트를 한 단위로 쓴다 (AGENTS.md): grant → enable row level security → create policy
-- ─────────────────────────────────────────────────────────────

-- ① grant
grant delete on public.plot_tasks to authenticated;

-- ② enable — 이미 켜져 있다. 테이블 생성 마이그레이션(20260916010000) 참고.

-- ③ policy
-- 내 밭에 딸린 카드만 지운다.
drop policy if exists plot_tasks_delete_own on public.plot_tasks;
create policy plot_tasks_delete_own on public.plot_tasks
  for delete to authenticated
  using (plot_id in (select id from public.plots where user_id = auth.uid()));
