-- ─────────────────────────────────────────────────────────────
-- plot_tasks 만료 — 안 하고 넘어간 카드를 닫는다
--
-- **왜 필요한가.** 생성 쪽(ai-service plot_tasks.generate_tasks_for_plot)은 같은
-- 제목의 **미완료** 카드가 있으면 새 카드를 만들지 않는다. 홈이 최근 3일치만
-- 보여 주게 되면서, 그보다 오래된 미완료 카드가 화면에는 없는데 생성은 계속
-- 막는 상태가 생겼다 — 가뭄이 이어져도 물 주기 카드가 영영 안 뜬다.
--
-- 그래서 3일이 지난 미완료 카드는 배치가 닫는다. 닫으면 같은 배치가 조건을 다시
-- 판정해 그날 기준 근거로 새 카드를 만든다.
--
-- **지우지 않고 닫는다.** "안 하고 넘어갔다"는 사실 자체가 이력이다. 지우면
-- 나중에 작황이 나빴을 때 무엇을 건너뛰었는지 되짚을 방법이 없다.
--
-- ⚠️ done 을 건드리지 않는다. done 은 사용자가 쓰는 값이고(컬럼 범위 GRANT),
--    만료는 배치가 쓰는 값이라 주체가 다르다. 한 컬럼에 섞으면 "사용자가 만료를
--    되돌릴 수 있는가" 같은 질문이 생긴다.
-- ─────────────────────────────────────────────────────────────

alter table public.plot_tasks
  add column if not exists expired_at timestamptz;

comment on column public.plot_tasks.expired_at is
  '안 하고 넘어간 시각. 배치만 쓴다(사용자에게 update 권한 없음). '
  '살아 있는 카드 = done = false and expired_at is null.';

-- 생성 쪽이 매일 밭마다 "열린 카드의 제목"을 묻고, 홈 조회도 같은 축으로 거른다.
-- 만료 컬럼이 붙으면서 그 조건이 (plot_id, done, expired_at) 3개가 됐다.
create index if not exists ix_plot_tasks_plot_open
  on public.plot_tasks (plot_id, done, expired_at);

-- ── 권한 ─────────────────────────────────────────────────────
-- **expired_at 을 authenticated 에게 주지 않는다.** 기존 GRANT 는
-- `update (done, done_at)` 로 컬럼을 좁혀 뒀고, 여기에 expired_at 을 더하면
-- 사용자가 자기 카드를 임의로 닫거나 되살릴 수 있다. 만료는 배치(service_role,
-- RLS 우회)만 쓴다 — 그래서 새 GRANT 가 없는 것이 맞다.
--
-- select 는 이미 전체 컬럼에 열려 있어 이력 화면이 만료 여부를 읽을 수 있다.
