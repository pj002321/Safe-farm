-- ─────────────────────────────────────────────────────────────
-- plots · cultivations — soft delete 를 되돌려 놓는다
--
-- 20260917000000_soft_delete.sql 이 delete 권한을 회수하고 delete 정책을
-- 지웠는데, **그 뒤에 도는 세 파일이 그대로 되살려 놓았다.**
--
--   20260917000001_cultivations_delete_grant.sql   grant delete
--   20260917000002_plots_delete_grant.sql          grant delete + 정책
--   20260917000003_cultivations_delete_policy.sql  정책
--
-- 셋 다 잘못 쓴 파일이 아니다. hard delete 시절에 "원문에는 있는데 실제
-- DB 에는 빠져 있던" 권한을 맞추려고 쓴 보정이고, 그 시점에는 맞았다.
-- soft delete 가 나중에 들어오면서 **파일 이름 순서가 곧 적용 순서**라
-- 보정 쪽이 뒤에 서게 됐다. 그래서 지금 DB 는 이렇다:
--
--   grant delete on plots, cultivations to authenticated  ← 열려 있음
--   plots_delete_own · cultivations_delete_own            ← 살아 있음
--
-- 이게 왜 문제인가: `cultivation_events` 와 관찰 기록이 `on delete cascade`
-- 로 매달려 있다. 코드 한 줄이 `.delete()` 로 새면 밭 하나의 실측 자료가
-- 통째로 사라지고, soft delete 로 얻으려던 것이 정확히 그것이었다.
--
-- ⚠️ 앞의 세 파일은 고치지 않는다. 이미 적용된 마이그레이션을 고쳐 봐야
--    적용을 마친 환경에서는 다시 돌지 않는다 — 새 파일로 덮는 것이 맞다.
-- ─────────────────────────────────────────────────────────────

-- ── 권한 ─────────────────────────────────────────────────────
-- 앱이 하는 일은 `deleted_at` 을 채우는 update 라 plots_update_own ·
-- cultivations_update_own 이 그대로 덮는다(둘 다 auth.uid() 로 소유자 확인).
revoke delete on public.plots from authenticated;
revoke delete on public.cultivations from authenticated;

-- anon 에도 붙어 있다. RLS 정책이 auth.uid() 를 보므로 실제로 지우지는
-- 못하지만, 권한표에 남아 있으면 다음 사람이 "열려 있다"고 읽는다.
revoke delete on public.plots from anon;
revoke delete on public.cultivations from anon;

-- ── 정책 ─────────────────────────────────────────────────────
-- grant 를 뺐으므로 걸릴 일이 없다. 남겨 두면 삭제가 열린 것처럼 읽힌다.
-- 영구 삭제가 필요해지면 서비스 롤(RLS 우회)로 하는 일회성 작업이지,
-- 사용자에게 주는 권한이 아니다.
drop policy if exists plots_delete_own on public.plots;
drop policy if exists cultivations_delete_own on public.cultivations;

-- ── plot_tasks ───────────────────────────────────────────────
-- 여기는 그대로 둔다. 규칙에서 나온 파생 자료라 ai-service 가 다시 만들고,
-- 만료 배치도 오래된 카드를 실제로 지운다. 앱 쪽에서도 밭을 숨길 때 그 밭의
-- 카드를 같이 지우므로 `delete` 권한이 계속 필요하다
-- (`features/plots/plotStore.ts` 의 softDeletePlot).
