-- ─────────────────────────────────────────────────────────────
-- ask_history — 사용자가 AI 질의응답(/v1/ask)에 보낸 질문 이력
--
-- 쓰기는 ai-service(Postgres 슈퍼유저 풀러 접속, RLS 우회)가 한다. 이 마이그레이션은
-- Next.js 프런트가 자기 이력을 직접 읽을 수 있게 하는 SELECT 쪽 RLS만 연다 —
-- INSERT/UPDATE 는 authenticated 에 grant 하지 않는다(줘도 정책이 없어 0행만 고친다).
--
-- ⚠️ RLS 3종 세트를 한 단위로 쓴다 (AGENTS.md): grant → enable row level security → create policy
-- ─────────────────────────────────────────────────────────────

create table if not exists public.ask_history (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  question   text not null,
  answer     text,
  -- 가드레일 차단·검색 결과 없음일 때 answer 대신 채우는 고정 문구
  message    text,
  -- 답변 평가. null = 아직 평가 안 함
  rating     text check (rating in ('up', 'down')),
  created_at timestamptz not null default now()
);

create index if not exists ix_ask_history_user_created
  on public.ask_history (user_id, created_at desc);

-- ① grant
grant select on public.ask_history to authenticated;

-- ② enable
alter table public.ask_history enable row level security;

-- ③ policy
-- 자기 이력만 본다.
drop policy if exists ask_history_select_own on public.ask_history;
create policy ask_history_select_own on public.ask_history
  for select to authenticated
  using (auth.uid() = user_id);
