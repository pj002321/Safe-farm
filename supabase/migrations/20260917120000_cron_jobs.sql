-- ─────────────────────────────────────────────────────────────
-- 배치 스케줄러 — pg_cron + pg_net
--
-- 잡 3개를 등록한다.
--   daily-tasks   매일 00:00 KST   오늘 할 일 카드 판정      (HTTP)
--   alerts-ingest 30분마다         KMA 기상특보 스냅샷 적재  (HTTP)
--   alerts-prune  매일 03:30 KST   특보 스냅샷 보존기간 정리 (순수 SQL)
--
-- ⚠️ **HTTP 대상은 Next 다. ai-service 가 아니다.** pg_net 은 Supabase 쪽에서
--    나가는 요청이라 대상이 공개 URL 이어야 하는데, ai-service 는 공개하지
--    않는다(LLM 엔드포인트가 같은 앱에 있다). Next 가 받아 내부망으로 넘긴다.
--
-- ⚠️ 이 파일만으로는 동작하지 않는다. **Vault 에 비밀 두 개를 먼저 넣어야 한다.**
--    저장소에 값을 넣지 않으려고 분리한 것이다(서비스 계정 키와 같은 방침):
--
--      select vault.create_secret('<랜덤 32바이트 이상>', 'cron_secret');
--      select vault.create_secret('https://<운영 도메인>', 'app_base_url');
--
--    `cron_secret` 은 Next 의 `CRON_SECRET` 환경변수와 **같은 값**이어야 한다.
-- ─────────────────────────────────────────────────────────────

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ── 특보 조회 인덱스 ──────────────────────────────────────────
-- warn_region._latest_active_alerts 는 언제나 `max(fetched_at)` 을 구한 뒤
-- `where fetched_at = <그 값>` 으로 한 스냅샷만 읽는다. official_alerts 는
-- append-only 인데 아래 적재 주기를 30분으로 올리므로, 인덱스가 없으면 저 두
-- 질의가 풀스캔이 된다 — 그 비용은 **홈 진입마다** 나간다(특보 배너가 이 경로다).
--
-- 표는 ai-service 의 SQLAlchemy 모델이 만든다. 모델에도 같은 인덱스를 선언해
-- 뒀지만(app/models/alert.py), 그건 create_all 로 **새로 만들 때만** 걸린다.
-- 이미 떠 있는 DB 에는 이 줄이 필요하다.
create index if not exists ix_official_alerts_fetched_at
  on public.official_alerts (fetched_at);

-- ── 공통 호출부 ───────────────────────────────────────────────
-- 잡마다 같은 http_post 를 복사하면 한 곳만 고치는 실수가 난다. 함수로 묶는다.
create or replace function public.call_cron_job(job_name text)
returns bigint
language plpgsql
security definer
-- search_path 를 고정한다. security definer 함수에서 이걸 빼면 호출자가
-- search_path 를 바꿔 우리가 의도하지 않은 함수를 실행시킬 수 있다.
set search_path = public, vault, net
as $$
declare
  base_url text;
  secret   text;
begin
  select decrypted_secret into base_url
    from vault.decrypted_secrets where name = 'app_base_url';
  select decrypted_secret into secret
    from vault.decrypted_secrets where name = 'cron_secret';

  -- 비밀이 없으면 **소리 내어 실패한다.** 조용히 넘어가면 크론은 성공으로
  -- 기록되고, 배치가 몇 주째 안 돌아도 아무도 모른다.
  if base_url is null or secret is null then
    raise exception 'Vault 에 app_base_url / cron_secret 이 없습니다';
  end if;

  return net.http_post(
    url     := base_url || '/api/cron/' || job_name,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || secret
    ),
    -- 기본 5초로는 모자란다. 밭 전체 판정은 밭 수만큼 계산이 돈다.
    -- Next 쪽 BATCH_TIMEOUT_MS(50초)보다 **길어야** 한다. 반대면 여기서 먼저
    -- 끊어, 서버는 계속 일하는데 결과를 못 받는 상태가 된다.
    timeout_milliseconds := 55000
  );
end;
$$;

revoke all on function public.call_cron_job(text) from public, anon, authenticated;

-- ── 잡 등록 ───────────────────────────────────────────────────
-- 재실행해도 중복되지 않게 먼저 해제한다. cron.job 에 없으면 0행이라 아무 일도
-- 일어나지 않는다(if exists 를 흉내내는 관용구다).
select cron.unschedule(jobname) from cron.job
  where jobname in ('daily-tasks', 'alerts-ingest', 'alerts-prune');

-- 00:00 KST = 15:00 UTC (전날).
--
-- ⚠️ **pg_cron 은 UTC 로 돈다.** 여기에 '0 0 * * *' 를 적으면 09:00 KST 에 돈다.
--    00시인 이유는 농부들이 새벽부터 일을 시작해서다 — 밭에 나갈 때 이미 그날
--    카드가 있어야 한다(ai-service app/service/plot_tasks.py 첫 문단).
select cron.schedule('daily-tasks', '0 15 * * *', $$
  select public.call_cron_job('tasks');
$$);

-- 30분마다. 특보는 수시로 발효·해제되므로 하루 한 번으로는 늦다.
select cron.schedule('alerts-ingest', '*/30 * * * *', $$
  select public.call_cron_job('alerts');
$$);

-- 03:30 KST = 18:30 UTC (전날). 적재가 append-only 라 두지 않으면 계속 커진다.
--
-- 7일인 이유: 조회는 **최신 스냅샷 하나**만 보고, 과거 스냅샷은 특보의 해제·연장
-- 이력을 되짚을 때만 쓴다(app/models/alert.py). 7일이면 그 용도에 충분하다.
-- 이 잡만 pg_net 을 쓰지 않는다 — 같은 DB 안의 일이라 HTTP 가 필요 없다.
select cron.schedule('alerts-prune', '30 18 * * *', $$
  delete from public.official_alerts
   where fetched_at < now() - interval '7 days';
$$);
