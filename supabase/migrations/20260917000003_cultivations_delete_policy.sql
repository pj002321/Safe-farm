-- ─────────────────────────────────────────────────────────────
-- cultivations — delete 정책 재적용
--
-- 20260916000001_cultivations.sql 원문에는 cultivations_delete_own 정책이
-- 있지만, 실제 dev DB 에는 반영돼 있지 않다(pg_policies 직접 조회로 확인,
-- grant 만 있고 정책이 없어 RLS 가 전부 걸러냈다). 20260917000001 과 같은 drift.
-- ─────────────────────────────────────────────────────────────

drop policy if exists cultivations_delete_own on public.cultivations;
create policy cultivations_delete_own on public.cultivations
  for delete to authenticated
  using (exists (
    select 1 from public.plots p
    where p.id = cultivations.plot_id and p.user_id = auth.uid()
  ));
