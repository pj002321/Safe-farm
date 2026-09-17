-- ─────────────────────────────────────────────────────────────
-- plots — delete 권한·정책 재적용
--
-- 20260915120000_plots_manage.sql 원문에는 delete grant 와 plots_delete_own
-- 정책이 있지만, 실제 dev DB 에는 둘 다 반영돼 있지 않다(수퍼유저 직접 조회로
-- 확인). supabase_migrations 히스토리엔 이미 적용된 것으로 남아 있어 db push 가
-- 다시 실행해 주지 않는다 — cultivations 와 같은 drift.
-- ─────────────────────────────────────────────────────────────

grant delete on public.plots to authenticated;

drop policy if exists plots_delete_own on public.plots;
create policy plots_delete_own on public.plots
  for delete to authenticated
  using (auth.uid() = user_id);
