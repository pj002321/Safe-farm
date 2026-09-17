-- ─────────────────────────────────────────────────────────────
-- cultivations — delete 권한 재적용
--
-- 20260916000001_cultivations.sql 원문에는 delete grant 가 있지만, 실제
-- dev DB 에는 반영돼 있지 않다(수퍼유저 직접 조회로 확인). supabase_migrations
-- 히스토리엔 이미 적용된 것으로 남아 있어 db push 가 다시 실행해 주지 않는다
-- — 그래서 새 파일로 같은 grant 를 한 번 더 실행한다. 정책은 그대로 있다.
-- ─────────────────────────────────────────────────────────────

grant delete on public.cultivations to authenticated;
