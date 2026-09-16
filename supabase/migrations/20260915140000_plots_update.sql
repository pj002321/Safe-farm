-- ─────────────────────────────────────────────────────────────
-- plots — 수정 권한
--
-- 20260915000000_plots.sql 은 "수정·삭제 화면이 생기는 시점에 같이 추가할 것"
-- 이라고 남겨 뒀다. 텃밭 정보 수정(ToDo1-2)이 그 시점이다.
--
-- ⚠️ 이 파일이 없으면 updatePlot() 은 **오류 없이 0행을 고친다.** grant 가 없으면
--    권한 오류가 나지만, grant 만 주고 정책을 빼면 RLS 가 전부 걸러내면서도
--    성공으로 끝난다. 그래서 grant 와 policy 를 같은 파일에 둔다.
-- ─────────────────────────────────────────────────────────────

-- ① grant  (delete 는 아직 주지 않는다 — 삭제 화면은 ToDo1-3)
grant update on public.plots to authenticated;

-- ② enable  — 이미 켜져 있다. 테이블 생성 마이그레이션 참고.

-- ③ policy
-- 자기 밭만 고친다. `with check` 로 **고친 뒤에도** 자기 밭이어야 함을 건다 —
-- 이게 없으면 user_id 를 남의 것으로 바꿔 밭을 넘길 수 있다.
drop policy if exists plots_update_own on public.plots;
create policy plots_update_own on public.plots
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- updated_at 은 plots_touch_updated_at 트리거가 갱신한다. 앱에서 넣지 않는다.
