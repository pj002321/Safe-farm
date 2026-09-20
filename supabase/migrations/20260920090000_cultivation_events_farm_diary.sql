-- ─────────────────────────────────────────────────────────────
-- cultivation_events — 관찰 기록을 영농일지로
--
-- 농민이 보조금·인증 서류를 쓸 때 보고 옮겨 적을 영농일지가 필요하다. 지금 기록에는 날짜와
-- 메모뿐이라 그대로는 서류가 안 된다. 농사로 폼이 받는 것(작업단계·활동유형·
-- 날씨·기온·강수·습도) 중 **숫자는 우리가 채우고, 고르는 것만 사용자가 고른다.**
-- 농민이 최저기온을 칠 이유는 없지만, 그날 하늘이 맑았는지는 농민만 안다.
--
-- ⚠️ **읽을 때 조인하지 않고 저장할 때 박는다.**
--    영농일지는 "그때 그랬다"는 기록이다. 관측이 나중에 정정되면 과거 일지가
--    소리 없이 바뀐다 — 어제 보고 적은 것과 오늘 보는 것이 다르면 못 쓴다.
--    총 GDD 를 저장하지 않는 harvestSummary 와 방침이 반대인데, 까닭도 반대다.
--    그쪽은 "지금 가장 정확한 값"이 필요하고 이쪽은 "그날 적은 값"이 필요하다.
--
-- ⚠️ **전부 nullable 이고, 빈 것이 정상이다.**
--    92일보다 오래된 날짜는 날씨를 못 찾는다(아래 출처 참조). 그때 rainfall_mm 을
--    0 으로 채우면 **"비가 안 왔다"는 뜻**이 된다. 반드시 비워 두고 화면이
--    "그날 날씨를 못 찾았습니다"로 그린다.
--
-- 값의 출처 — app/service/forecast_cache.py 의 forecast(밭 좌표, past_days=92).
-- weather_obs_daily 를 쓰지 않는다. 관측 표는 어제까지이고 습도·바람·일출일몰이
-- 없는데, Open-Meteo 응답 한 줄에는 과거 92일치까지 그게 다 들어 있다.
--
-- 권한 — 20260917110000 의 grant 가 컬럼이 아니라 **테이블 단위**다
-- (`grant select, insert, update, delete on public.cultivation_events`).
-- 컬럼을 더해도 그대로 덮이므로 여기서 grant 를 다시 쓰지 않는다. RLS 정책 넷도
-- cultivation_id 로만 가르므로 손댈 것이 없다.
-- ─────────────────────────────────────────────────────────────

-- ── ① 일지 칸 ────────────────────────────────────────────────
alter table public.cultivation_events
  -- 농사로의 "활동유형". 물주기 · 웃거름 · 방제 · 김매기 · 수확 · 기타.
  -- CHECK 를 걸지 않는다 — 값이 하나 늘 때마다 마이그레이션을 내야 하고,
  -- 이 칸은 사람이 읽는 CSV 로만 나간다(판정에 쓰지 않는다).
  add column if not exists work_kind    text,

  -- `했음` 을 누른 그 시점의 조언 문장. 조언은 날씨·단계로 매일 다시 계산되므로
  -- 나중에 읽으면 그날 뭘 보고 눌렀는지 알 수 없다.
  add column if not exists advice_text  text,

  -- 그날 날씨. 화면이 쓰는 단위 그대로 담는다(℃ · mm · % · m/s · 도).
  add column if not exists temp_max_c   numeric,
  add column if not exists temp_min_c   numeric,
  add column if not exists rainfall_mm  numeric,
  add column if not exists humidity_pct numeric,
  add column if not exists wind_ms      numeric,
  -- **불어오는 쪽**이다(api/weather.py 의 windDirDeg 와 같은 뜻). 화살표는 화면이 돌린다.
  add column if not exists wind_dir_deg numeric,

  -- "06:19" 꼴. timestamptz 로 두지 않는다 — 날짜는 occurred_on 에 이미 있고,
  -- 시각만 보는 칸이라 시간대 변환이 끼면 하루 어긋날 여지만 생긴다.
  add column if not exists sunrise_at   text,
  add column if not exists sunset_at    text,

  -- 맑음 · 흐림 · 비 · 눈. 위 칸들과 달리 **사용자가 고른다.**
  -- open_meteo_client.py 의 daily 요청에 weather_code 가 없어 우리는 맑음과
  -- 흐림을 가를 수 없다. 거기에 weather_code 를 더하면 예보 카드·리포트가 같이
  -- 쓰는 호출이 무거워지므로, 날짜 옆 <select> 에서 고르게 하는 쪽이 싸다.
  -- 안 고르면 빈다 — 기본값을 두면 전부 '맑음' 인 일지가 된다.
  add column if not exists sky_ko       text;

-- ── ② 사용자 단계 더하기 — kind 에 STAGE_ADD ──────────────────
-- 수확 뒤의 말림·가공처럼 crop_stages(마스터)에 없는 단계를 그 재배에만 붙인다.
-- 마스터는 농사로에서 온 작물 공통 자료라 사용자가 못 고친다.
--
-- ⚠️ **제약이 둘이라 둘 다 고쳐야 한다.** payload 쪽 `else false` 때문에
--    kind 목록만 늘리면 STAGE_ADD 행이 두 번째 제약에서 그대로 막힌다.

-- 인라인 CHECK 라 Postgres 가 자동으로 붙인 이름이다(<표>_<열>_check).
alter table public.cultivation_events
  drop constraint if exists cultivation_events_kind_check;

alter table public.cultivation_events
  add constraint cultivation_events_kind_check
  check (kind in ('NOTE', 'TASK_DONE', 'STAGE_SET', 'FORECAST', 'STAGE_ADD'));

alter table public.cultivation_events
  drop constraint if exists ck_cultivation_events_payload;

alter table public.cultivation_events
  add constraint ck_cultivation_events_payload check (
    case kind
      when 'NOTE'      then body is not null
      when 'TASK_DONE' then body is not null
      when 'STAGE_SET' then stage_order is not null
      when 'FORECAST'  then forecast_on is not null
      -- 단계 이름이 body 에 들어간다. 표를 새로 만들지 않는 까닭은
      -- kind·occurred_on·body 로 이미 충분해서다.
      -- stage_order 는 비운다 — 마스터에 없는 단계라 가리킬 번호가 없다.
      when 'STAGE_ADD' then body is not null
      else false
    end
  );

-- ── ③ 확인 ───────────────────────────────────────────────────
-- ②의 이름 추측이 틀리면 옛 제약이 조용히 살아남아 STAGE_ADD 를 계속 막는다.
-- 조용한 실패가 제일 나쁘므로 여기서 소리 내어 죽인다.
do $$
declare
  남은 text;
begin
  select string_agg(conname, ', ')
    into 남은
    from pg_constraint
   where conrelid = 'public.cultivation_events'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) like '%STAGE_SET%'
     and pg_get_constraintdef(oid) not like '%STAGE_ADD%';

  if 남은 is not null then
    raise exception
      'STAGE_ADD 를 모르는 제약이 남았다: %. 이 이름으로 위 ② 를 다시 쓸 것', 남은;
  end if;
end $$;
