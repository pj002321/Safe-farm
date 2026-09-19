-- ─────────────────────────────────────────────────────────────
-- advices — 재배 건별 AI 생육 리포트 캐시 (F2/F3/F7, docs/safefarm_답변.md §3)
--
-- LLM 호출은 하루 한 번만 한다. GDD·강수·예보 같은 실측값은 부를 때마다 새로
-- 계산하지만(살아 있는 값이라 캐시하면 하루 종일 어제 날씨가 보인다), 그 값을
-- 문장으로 바꾸는 LLM 호출만 cultivation_id + advice_date 로 캐시해 토큰을
-- 아낀다. input_snapshot 은 그 문장을 만들 때 쓴 입력값 전체 — 조언이 이상할
-- 때 어느 계산이 근거였는지 추적하는 용도다.
--
-- 쓰기·읽기 전부 ai-service(슈퍼유저 풀러 접속, RLS 우회)만 한다. Next.js 는
-- 이 테이블을 직접 열지 않고 항상 ai-service 의 /v1/reports 를 거친다 —
-- authenticated 에는 아무 권한도 주지 않는다.
--
-- ⚠️ RLS는 켜되 policy를 하나도 안 둔다 — enable 만 하면 테이블 소유자(슈퍼유저)
--    를 뺀 모든 역할이 기본 거부된다. 아무도 직접 열 이유가 없는 테이블이다.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.advices (
  id             uuid primary key default gen_random_uuid(),
  cultivation_id uuid not null references public.cultivations(id) on delete cascade,
  advice_date    date not null,
  summary        text not null,
  todos          text[] not null default '{}',
  warnings       text[] not null default '{}',
  input_snapshot jsonb not null,
  created_at     timestamptz not null default now(),
  unique (cultivation_id, advice_date)
);

alter table public.advices enable row level security;

-- farm_advices — 사용자의 밭 전체를 아우르는 하루 한 번짜리 종합 요약.
-- 위와 같은 이유(토큰 절약)로 캐시하되, 대상이 재배 건 하나가 아니라 사용자
-- 전체 밭이라 별도 테이블로 둔다.
create table if not exists public.farm_advices (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  advice_date    date not null,
  summary        text not null,
  input_snapshot jsonb not null,
  created_at     timestamptz not null default now(),
  unique (user_id, advice_date)
);

alter table public.farm_advices enable row level security;
