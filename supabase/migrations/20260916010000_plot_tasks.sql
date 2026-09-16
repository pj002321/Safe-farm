-- ─────────────────────────────────────────────────────────────
-- plot_tasks — 필지별 "오늘 할 일" 카드
--
-- 매일 00시 배치(ai-service)가 만든다. 완료 체크는 Next.js가 RLS로 직접 한다
-- (ai-service를 거치지 않는다 — 사용자 액션이지 AI 판단이 아니라서다).
-- 완료된 행을 지우거나 옮기지 않는다: done=true인 행 자체가 재배 기록이다
-- (cultivation_logs 같은 별도 이력 테이블을 안 둔 이유).
--
-- source_document_id 는 ai-service 소유 documents 테이블(app/models/document.py)을
-- 가리키지만 FK 는 걸지 않는다. documents 는 이 마이그레이션 체계가 아니라
-- pipeline/doc/init_doc_db.py 가 따로 만들어서, FK 를 걸면 두 초기화 스크립트
-- 사이에 순서 의존이 생긴다.
--
-- ⚠️ RLS 3종 세트를 한 단위로 쓴다 (AGENTS.md): grant → enable row level security → create policy
-- ─────────────────────────────────────────────────────────────

create table if not exists public.plot_tasks (
  id                  uuid primary key default gen_random_uuid(),
  plot_id             uuid not null references public.plots(id) on delete cascade,
  title               text not null,
  -- 이 작업이 왜 나왔는지 한 문장. 근거를 못 만들면 카드 자체를 만들지 않는다
  -- (스펙 규칙) — not null 로 걸어 DB 단에서도 강제한다.
  reason              text not null,
  priority            text not null check (priority in ('high', 'mid', 'low')),
  source_document_id  uuid,
  generated_at        timestamptz not null default now(),
  done                boolean not null default false,
  done_at             timestamptz
);

create index if not exists ix_plot_tasks_plot_priority
  on public.plot_tasks (plot_id, priority);

-- ① grant
-- authenticated 는 완료 체크만 한다 — done/done_at 두 컬럼만 update 권한을 준다.
-- 카드 생성(insert)은 ai-service 의 슈퍼유저 접속만 한다(RLS 우회).
grant select, update (done, done_at) on public.plot_tasks to authenticated;

-- ② enable
alter table public.plot_tasks enable row level security;

-- ③ policy
-- 내 밭에 딸린 카드만 본다.
drop policy if exists plot_tasks_select_own on public.plot_tasks;
create policy plot_tasks_select_own on public.plot_tasks
  for select to authenticated
  using (plot_id in (select id from public.plots where user_id = auth.uid()));

-- 내 밭에 딸린 카드만 완료 체크할 수 있다.
drop policy if exists plot_tasks_update_own on public.plot_tasks;
create policy plot_tasks_update_own on public.plot_tasks
  for update to authenticated
  using (plot_id in (select id from public.plots where user_id = auth.uid()))
  with check (plot_id in (select id from public.plots where user_id = auth.uid()));
