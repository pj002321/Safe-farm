-- ─────────────────────────────────────────────────────────────
-- 테이블 권한 조이기 — anon · authenticated
--
-- Supabase 는 `public` 스키마에 테이블이 생기면 default privileges 로
-- `anon` · `authenticated` 에 **ALL 을 자동으로 붙인다.** 그래서 각 마이그레이션이
-- 적어 둔 grant 는 좁히는 역할을 한 적이 없다 — grant 는 누적이라서다.
--
-- 2026-09-18 실측(information_schema.role_table_grants):
--
--   normals · grids · weather_obs_daily · weather_forecast · stations ·
--   disaster_rules · plot_tasks
--     → anon · authenticated 둘 다
--       DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--
-- 앞 여섯은 RLS 가 꺼져 있어(relrowsecurity = false) 이 권한이 그대로 먹는다.
-- anon 키는 브라우저에 나가 있으므로 평년값·예보·관측 자료를 누구나 지우거나
-- 바꿀 수 있는 상태다.
--
-- ⚠️ 쓰기는 ai-service 가 `postgres` 로 직접 접속해서 한다. 이 롤은 표의
--    소유자라 grant 를 안 보고, rolbypassrls = true 라 RLS 도 안 탄다. 아래 회수는
--    파이프라인에 영향이 없다. Next 는 읽기만 하므로 select 는 남긴다.
-- ─────────────────────────────────────────────────────────────

-- ── 기상·기준 자료 6종 — 읽기 전용 ────────────────────────────
-- `revoke all` 로 한 번에 내리고 select 만 다시 준다. insert/update/delete/
-- truncate 를 하나씩 빼면 REFERENCES·TRIGGER 가 남는다 — TRIGGER 는 이 테이블에
-- 트리거를 달 수 있다는 뜻이라 남겨 둘 이유가 없다.
revoke all on public.normals           from anon, authenticated;
revoke all on public.grids             from anon, authenticated;
revoke all on public.weather_obs_daily from anon, authenticated;
revoke all on public.weather_forecast  from anon, authenticated;
revoke all on public.stations          from anon, authenticated;
revoke all on public.disaster_rules    from anon, authenticated;

-- RLS 가 꺼진 표라 grant 가 유일한 방어선이다. anon 에도 select 를 주는 이유는
-- Next 서버가 anon 키 + 세션 쿠키로 읽기 때문이다(shared/supabase/server.ts).
-- 개인정보가 없는 공개 기상 자료라 열람 자체는 문제되지 않는다.
grant select on public.normals           to anon, authenticated;
grant select on public.grids             to anon, authenticated;
grant select on public.weather_obs_daily to anon, authenticated;
grant select on public.weather_forecast  to anon, authenticated;
grant select on public.stations          to anon, authenticated;
grant select on public.disaster_rules    to anon, authenticated;

-- ── plot_tasks — 완료 체크 + 삭제 ─────────────────────────────
-- 20260916010000_plot_tasks.sql 이 의도한 모양으로 되돌린다:
--   "authenticated 는 완료 체크만 한다 — done/done_at 두 컬럼만 update"
--
-- 지금은 10개 컬럼 전부에 UPDATE 가 붙어 있어 사용자가 자기 카드의 title ·
-- reason · priority · generated_at 을 PostgREST 로 고칠 수 있다. `expired_at`
-- 도 마찬가지다 — 모델 주석은 "배치만 쓴다"고 적혀 있지만 실제로는 열려 있고,
-- 이 값을 사용자가 지우면 닫힌 카드가 홈에 되살아난다.
--
-- anon 에는 아무것도 주지 않는다. 정책 3종이 전부 `to authenticated` 라
-- 어차피 한 행도 못 보지만, 권한표에 남아 있으면 다음 사람이 열린 것으로 읽는다.
revoke all on public.plot_tasks from anon, authenticated;
grant select, update (done, done_at) on public.plot_tasks to authenticated;

-- ⚠️ **delete 는 남긴다.** `features/plots/plotStore.ts` 의 softDeletePlot 이
--    밭을 숨길 때 그 밭의 카드를 실제로 지운다. 규칙에서 나온 파생 자료라
--    ai-service 가 다시 만든다. 이 grant 를 빼면 밭 삭제가 권한 오류로 실패한다.
--    정책(plot_tasks_delete_own)은 그대로 살려 둔다 — 내 밭 카드만 지운다.
grant delete on public.plot_tasks to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 재발 방지 — 결정 필요
--
-- 위 회수는 **이미 있는 테이블만** 고친다. default privileges 를 그대로 두면
-- 앞으로 만드는 테이블마다 같은 일이 반복된다. 아래 한 줄이 근본 해결이지만
-- 스키마 전체의 기본 동작을 바꾸므로, 새 테이블마다 grant 를 직접 써야 한다는
-- 뜻이 된다. 팀 합의 뒤에 주석을 푼다.
--
--   alter default privileges in schema public
--     revoke all on tables from anon, authenticated;
--
-- 푼 뒤에는 새 테이블에 grant 를 빠뜨리면 조용히 안 열리는 게 아니라
-- PostgREST 가 404/401 로 답한다 — 실패가 눈에 보이는 쪽이라 이 편이 낫다.
-- ─────────────────────────────────────────────────────────────
