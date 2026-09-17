-- ─────────────────────────────────────────────────────────────
-- ask_history — 답변 피드백에 "사유" 를 붙인다
--
-- 20260916000000_ask_history.sql 은 rating(up/down)만 받았다. up/down 만으로는
-- 검색 품질을 어디부터 고칠지 알 수 없다 — 근거 문서가 엉뚱했는지, 맞는 문서인데
-- 답변이 틀렸는지, 내 밭 얘기가 아니었는지가 구분되지 않는다. 그 구분을 담는 칸이다.
--
-- ⚠️ 자유 입력이라 개인정보(이름·연락처·주소)가 섞여 들어올 수 있다. 그래서
--    · 길이를 200자로 막는다(`app/schemas/ask.py` 의 FEEDBACK_REASON_MAX).
--    · **읽기 권한을 열지 않는다.** ask_history 의 select 정책은 자기 이력을
--      보여주지만, 이 칸은 화면에 되돌려 줄 이유가 없다. 아래 정책에서 컬럼을
--      빼는 대신 grant 를 컬럼 단위로 다시 준다.
-- ─────────────────────────────────────────────────────────────

alter table public.ask_history
  add column if not exists feedback_reason text;

-- 사유가 달린 행만 담는 부분 인덱스. 품질 점검은 "사유가 적힌 것"만 훑는다.
create index if not exists ix_ask_history_feedback_reason
  on public.ask_history (created_at desc) where feedback_reason is not null;

-- ── 권한 ─────────────────────────────────────────────────────
-- 20260916000000 은 `grant select on public.ask_history` 로 테이블 전체를 줬다.
-- 컬럼이 늘면 그 grant 가 새 컬럼까지 자동으로 덮으므로, 여기서 회수하고 읽어도
-- 되는 컬럼만 다시 준다. 쓰기는 여전히 ai-service(RLS 우회) 몫이라 주지 않는다.
revoke select on public.ask_history from authenticated;

grant select (id, user_id, question, answer, message, rating, created_at)
  on public.ask_history to authenticated;

-- RLS 정책(ask_history_select_own)은 그대로 둔다. 컬럼 grant 와 행 정책은 별개의
-- 관문이라 둘 다 통과해야 읽힌다 — 정책은 "누구의 행인가", grant 는 "어느 칸인가".
