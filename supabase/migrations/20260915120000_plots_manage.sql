-- ─────────────────────────────────────────────────────────────
-- plots — 수정·삭제 권한 (마이페이지 텃밭 관리)
--
-- 20260915000000_plots.sql 은 마지막 줄을 이렇게 남겨 두었다:
--   "update·delete 는 아직 화면이 없다. grant 를 안 줬으므로 정책도 만들지
--    않는다 (수정·삭제 화면이 생기는 시점에 같이 추가할 것)."
-- 마이페이지(/me)의 텃밭 관리가 그 화면이다. 약속대로 여기서 같이 더한다.
--
-- ⚠️ **RLS 3종 세트를 한 단위로 쓴다** (AGENTS.md):
--      grant → enable row level security → create policy
--    셋 중 하나라도 빠지면 그 순간 의도와 다른 상태가 된다. 권한을 **넓히는**
--    마이그레이션은 특히 그렇다 — grant 만 주고 정책을 빠뜨리면 기본 거부라
--    아무도 못 고치고(조용한 고장), 정책만 만들고 grant 를 빠뜨려도 마찬가지다.
--    반대로 grant 를 주고 정책을 너무 넓게 쓰면 남의 밭이 열린다.
-- ─────────────────────────────────────────────────────────────

-- ── RLS 3종 세트 ─────────────────────────────────────────────
-- ① grant
-- insert·select 는 앞 마이그레이션이 이미 줬다. 여기서는 두 개만 더한다.
grant update, delete on public.plots to authenticated;

-- ② enable
-- 이미 켜져 있다(20260915000000). idempotent 라 다시 불러도 안전하고,
-- 3종 세트를 한 덩어리로 읽히게 두는 편이 다음 사람이 빠뜨릴 여지를 줄인다.
alter table public.plots enable row level security;

-- ③ policy
-- 자기 밭만 고친다. **그리고 남에게 넘기지 못한다.**
--
-- update 정책은 검사가 둘이고, 각각 보는 행이 다르다. 둘 다 있어야 한다:
--   · using      → **고치기 전의 행**. 남의 밭을 집는 것을 막는다.
--   · with check → **고친 뒤의 행**. 내 밭을 남의 것으로 바꾸는 것을 막는다.
-- 하나만 쓰면 한쪽이 뚫린다. using 만 있으면 내 밭에
-- `user_id = <남의 uuid>` 를 써서 넘길 수 있고(사실상 남의 계정에 행을 꽂는
-- insert 가 된다), with check 만 있으면 남의 밭을 집어 내 것으로 도장 찍을 수 있다.
--
-- profiles 처럼 `col = (select ... )` 로 컬럼별 동일성을 걸지 않는 이유:
-- 여기서는 **user_id 자체가 소유권**이라 `auth.uid() = user_id` 한 줄이
-- 소유 확인과 불변 보장을 동시에 한다. 조건을 늘리면 읽는 사람만 헷갈린다.
--
-- ⚠️ 나머지 컬럼은 이 정책이 막지 않는다. 특히 **grid_x·grid_y 는 위경도에서
--    계산되는 값**이라, 좌표만 바뀌고 격자가 그대로면 예보를 엉뚱한 동네에서
--    받아 온다. RLS 로는 표현할 수 없는 규칙이므로 **서버 액션이 위경도를 받을
--    때마다 격자를 다시 계산해서 함께 써야 한다**(plots/new 의 registerPlot 과
--    같은 방식). 클라이언트가 보낸 grid_x·grid_y 는 쓰지 않는다.
drop policy if exists plots_update_own on public.plots;
create policy plots_update_own on public.plots
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 자기 밭만 지운다. delete 에는 with check 가 없다 — 남는 행이 없어서다.
--
-- 지울 때 딸려 지울 것은 아직 없다. plots.id 를 참조하는 테이블이 하나도 없고
-- (재배 기록은 화면만 있고 테이블이 없다), 계정 삭제 쪽은 plots.user_id 의
-- `on delete cascade` 가 이미 처리한다.
-- ⚠️ 재배 기록 테이블이 생기면 그 테이블의 plot_id 에 `on delete cascade` 를
--    붙일지 여기서 함께 정할 것. 기록을 남겨야 한다면 cascade 대신
--    `on delete set null` 이고, 그러면 plot_id 는 nullable 이어야 한다.
drop policy if exists plots_delete_own on public.plots;
create policy plots_delete_own on public.plots
  for delete to authenticated
  using (auth.uid() = user_id);
