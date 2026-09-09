-- ─────────────────────────────────────────────────────────────────────────────
-- LangGraph checkpointer 스키마 + TTL 청소
--
-- 왜 마이그레이션으로 하는가:
--   PostgresSaver 에는 `.setup()` 이 있지만 앱에서 부르면 안 된다.
--   (1) 콜드 스타트마다 버전 조회 왕복이 붙고
--   (2) 동시 콜드 스타트 두 개가 check-then-insert 레이스로 23505 를 낸다.
--   스키마 변경은 배포 파이프라인에 두는 게 맞다.
--
-- DDL 출처: @langchain/langgraph-checkpoint-postgres@1.0.5 의 getMigrations("langgraph").
--   패키지를 올릴 때 아래 명령으로 대조할 것:
--   node -e "const{getMigrations}=require('@langchain/langgraph-checkpoint-postgres/dist/migrations.cjs');console.log(getMigrations('langgraph').join('\n'))"
-- ─────────────────────────────────────────────────────────────────────────────

create schema if not exists langgraph;

-- ⚠️ public 에 두면 안 되는 이유:
--    checkpoint_blobs.blob 에 직렬화된 대화 전체가 들어간다. public 스키마는
--    PostgREST 기본 노출 대상이고 기존 프로젝트는 anon 에게 CRUD 가 부여돼 있어,
--    publishable 키만으로 남의 대화를 읽고 지울 수 있다.
--    RLS 로 막는 것도 답이 아니다 — PostgresSaver 는 사용자 식별자 개념이 없어
--    (thread_id 가 전부) 의미 있는 정책을 쓸 수 없다. API 표면에서 빼는 게 맞다.
revoke all on schema langgraph from anon, authenticated;
alter default privileges in schema langgraph revoke all on tables from anon, authenticated;

create table if not exists langgraph.checkpoint_migrations (
  v integer primary key
);

create table if not exists langgraph.checkpoints (
  thread_id text not null,
  checkpoint_ns text not null default '',
  checkpoint_id text not null,
  parent_checkpoint_id text,
  type text,
  checkpoint jsonb not null,
  metadata jsonb not null default '{}',
  primary key (thread_id, checkpoint_ns, checkpoint_id)
);

create table if not exists langgraph.checkpoint_blobs (
  thread_id text not null,
  checkpoint_ns text not null default '',
  channel text not null,
  version text not null,
  type text not null,
  blob bytea,
  primary key (thread_id, checkpoint_ns, channel, version)
);

create table if not exists langgraph.checkpoint_writes (
  thread_id text not null,
  checkpoint_ns text not null default '',
  checkpoint_id text not null,
  task_id text not null,
  idx integer not null,
  channel text not null,
  type text,
  blob bytea not null,
  primary key (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
);

-- 패키지가 이미 적용했다고 인식하도록 버전을 채워둔다.
-- 이게 없으면 앱이 .setup() 을 부를 경우 마이그레이션을 다시 돌린다.
insert into langgraph.checkpoint_migrations (v)
select generate_series(0, 4)
on conflict (v) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- TTL: 오래된 대화 상태 청소
--
-- 이 테이블들에는 timestamp 컬럼이 없다. 대신 checkpoint JSONB 안의 `ts`
-- (ISO8601, Checkpoint.ts 필드)를 기준으로 쓴다.
-- 그래프 1회 실행에 3개 테이블 합쳐 약 100 row 가 쌓이고 빌트인 만료가 없어서
-- (langgraphjs#1138) 이걸 안 걸면 무한 증식한다.
-- ─────────────────────────────────────────────────────────────────────────────

-- ts 기준 스캔이 full scan 이 되지 않게. PK 외 인덱스가 없는 상태라 필요하다.
create index if not exists checkpoints_ts_idx
  on langgraph.checkpoints (((checkpoint ->> 'ts')::timestamptz));

create or replace function langgraph.purge_expired_checkpoints(retention interval default '30 days')
returns integer
language plpgsql
security definer
set search_path = langgraph, pg_catalog
as $$
declare
  purged integer;
begin
  -- 스레드 단위로 지운다. blobs 에는 checkpoint_id 가 없어 thread_id 로만
  -- 지울 수 있고, 한 스레드의 일부만 지우면 참조가 깨진다.
  create temp table _stale on commit drop as
    select thread_id
    from langgraph.checkpoints
    group by thread_id
    having max((checkpoint ->> 'ts')::timestamptz) < now() - retention;

  delete from langgraph.checkpoint_writes w using _stale s where w.thread_id = s.thread_id;
  delete from langgraph.checkpoint_blobs  b using _stale s where b.thread_id = s.thread_id;
  delete from langgraph.checkpoints       c using _stale s where c.thread_id = s.thread_id;

  get diagnostics purged = row_count;
  return purged;
end;
$$;

revoke all on function langgraph.purge_expired_checkpoints(interval) from public, anon, authenticated;

-- 매일 새벽 4시(UTC 19시 = KST 04시) 실행.
-- pg_cron 은 Supabase Dashboard → Database → Extensions 에서 켜야 한다.
-- 켜기 전이면 이 블록은 조용히 건너뛴다.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'purge-langgraph-checkpoints',
      '0 19 * * *',
      $cron$ select langgraph.purge_expired_checkpoints('30 days'::interval) $cron$
    );
  else
    raise notice 'pg_cron 미설치 — purge 스케줄을 건너뜁니다. 확장을 켠 뒤 이 블록을 다시 실행하세요.';
  end if;
end;
$$;
