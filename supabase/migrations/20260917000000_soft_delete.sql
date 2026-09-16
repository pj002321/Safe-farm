-- ─────────────────────────────────────────────────────────────
-- plots · cultivations — 삭제를 soft delete 로 바꾼다
--
-- 20260915120000_plots_manage.sql 은 hard delete 로 갔고, cultivations 도
-- 같은 방식이었다. 여기서 둘 다 `deleted_at` 으로 바꾼다.
--
-- 왜: 밭과 재배 기록은 ToDo4 의 관찰 기록이 매달리는 뿌리다. 행이 실제로
-- 사라지면 `on delete cascade` 를 타고 관측·생육 기록이 함께 없어져, 나중에
-- 모델을 검증할 실측 자료가 지워진 밭만큼 비어 버린다. 잘못 등록한 건을
-- 정정하는 값은 그대로 두면서 자료는 남기려면 숨기는 쪽이 맞다.
--
-- 값은 `timestamptz` 다. boolean 으로 두면 "언제 지웠나"를 못 적어, 되살릴지
-- 영구 삭제할지 판단할 근거가 없다.
--
-- ⚠️ **읽는 쪽이 전부 `deleted_at is null` 을 걸어야 한다.** 빠뜨리면 지운
--    밭이 그대로 보인다. 지금 거는 곳은 `features/plots/plotStore.ts`,
--    `features/cultivations/cultivationStore.ts`, `ai-service` 의
--    `app/service/ask_context.py` 세 곳뿐이다.
-- ─────────────────────────────────────────────────────────────

alter table public.plots
  add column if not exists deleted_at timestamptz;

alter table public.cultivations
  add column if not exists deleted_at timestamptz;

-- 살아 있는 행만 담는 부분 인덱스. 조회에 `deleted_at is null` 이 항상 붙으므로
-- 조건을 인덱스에 같이 넣는다 — 지운 행이 쌓여도 인덱스는 안 커진다.
create index if not exists plots_user_id_live_idx
  on public.plots (user_id) where deleted_at is null;

create index if not exists cultivations_plot_id_live_idx
  on public.cultivations (plot_id) where deleted_at is null;

-- ── 권한 ─────────────────────────────────────────────────────
-- delete 권한을 회수한다. soft delete 로 정해 놓고 grant 를 남겨 두면 그건
-- 규칙이 아니라 권고다 — 코드 한 줄이 `.delete()` 로 새면 행이 실제로 사라진다.
-- 앱이 하는 일은 update 라 `plots_update_own` · `cultivations_update_own` 이
-- 그대로 덮는다(둘 다 `auth.uid()` 로 소유자를 확인한다).
revoke delete on public.plots from authenticated;
revoke delete on public.cultivations from authenticated;

-- grant 를 뺐으므로 delete 정책은 이제 걸릴 일이 없다. 남겨 두면 다음 사람이
-- "삭제가 열려 있다"고 읽으므로 같이 지운다. 영구 삭제가 필요해지면 서비스
-- 롤(RLS 우회)로 하는 일회성 작업이지, 사용자에게 주는 권한이 아니다.
drop policy if exists plots_delete_own on public.plots;
drop policy if exists cultivations_delete_own on public.cultivations;

-- ⚠️ select 정책에는 `deleted_at is null` 을 **넣지 않는다.**
--    넣으면 지운 행이 자기 자신에게도 안 보여 되살릴 길이 막히고, 무엇보다
--    `update ... returning` 이 걸린다 — soft delete 는 update 인데 그 결과 행은
--    이미 `deleted_at` 이 차 있어서 select 정책에 걸러진다. 그러면 앱이 0건으로
--    읽고 "없는 밭"이라 오판한다. 숨기는 일은 조회 쪽 필터가 한다.

-- 계정 삭제는 그대로 hard delete 다. `plots.user_id` 의 `on delete cascade` 가
-- auth.users 를 따라 지우고, 그건 시스템이 수행하므로 위 revoke 와 무관하다.
-- 탈퇴한 사용자의 자료까지 남길 이유는 없다.
