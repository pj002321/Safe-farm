-- 위성 관측(NDVI·NDMI)을 담아 두는 표.
--
-- 왜 표를 두는가 — **밖에 묻는 일과 화면에 그리는 일을 가른다.**
-- 기온·강수는 이미 그렇게 돈다(weather_obs_daily). 위성만 아직 볼 때마다
-- Sentinel Hub 를 불렀다. 그런데 이 값은 구름과 재방문 주기 때문에 **평균 18일에
-- 한 번**밖에 안 바뀐다(2026-09-19 실측 · 전남 밭 3곳 · 90일에 5건 · 최장 공백
-- 32일). 날씨 탭과 리포트가 각자 물어서, 같은 답을 받으려고 매번 1.5초를 썼다.
--
-- ⚠ **밭이 아니라 좌표로 묶는다.** app/api/satellite.py 가 좌표를 받는 API 이고
--   그 계약을 그대로 두려는 것이다. 좌표는 소수 4자리(약 11m)로 반올림한다 —
--   Sentinel-2 화소(10m)·조회 폴리곤 반폭(15m)과 같은 눈금이다.
--   잘게 나누면 같은 밭이 매번 다른 열쇠가 되어 표가 쓸모없어지고,
--   굵게 잡으면 옆 밭의 값을 우리 밭 것으로 읽는다.
--
-- ⚠ 표는 ai-service 의 SQLAlchemy 모델도 선언한다
--   (app/models/farm/satellite_observation.py). 그건 create_all 로 **새로 만들 때만**
--   걸린다. 이미 떠 있는 DB 에는 이 파일이 정본이다.

create table if not exists public.satellite_observations (
  lat      numeric(8, 4) not null,
  lon      numeric(9, 4) not null,

  -- 위성이 지나간 날. 이미 관측된 값이라 나중에 바뀌지 않는다
  obs_date date not null,

  -- 잎이 우거진 정도(-1~1). 밭이 아닌 좌표(물·건물)는 음수가 나온다
  ndvi numeric(4, 3),

  -- 잎 속 수분(-1~1)
  ndmi numeric(4, 3),

  -- 같은 좌표·같은 날이 두 번 들어가지 않는다. 적재가 upsert 로 도는 근거다
  primary key (lat, lon, obs_date)
);

-- **언제 물어봤나.** 관측 표만으로는 알 수 없다 —
-- 구름에 가려 90일에 한 점도 없을 수 있어서(최장 공백 32일 실측), "행이 없다"가
-- *아직 안 물어봤다* 인지 *물어봤는데 없다* 인지 구분되지 않는다. 그 둘을 못 가르면
-- 관측 없는 좌표는 요청마다 Sentinel Hub 를 다시 부른다.
create table if not exists public.satellite_fetches (
  lat numeric(8, 4) not null,
  lon numeric(9, 4) not null,

  -- 이 좌표로 받아 둔 구간의 시작일. 더 옛날을 물으면 캐시가 모자라 다시 받는다.
  -- 넓은 쪽으로만 갱신한다(least) — 좁히면 다음 요청이 캐시를 못 쓴다
  covered_from date not null,

  -- 마지막으로 물어본 때. 오래되면 새 관측이 생겼을 수 있어 다시 받는다
  -- (app/service/satellite_cache.CACHE_TTL)
  fetched_at timestamptz not null,

  primary key (lat, lon)
);

comment on table public.satellite_observations is
  'Sentinel-2 NDVI·NDMI 담아 둔 것. 관측이 평균 18일에 한 번이라 실시간 조회할 값이 아니다.';
comment on table public.satellite_fetches is
  '좌표별 마지막 조회 시각. 관측 0건인 좌표를 매번 다시 묻지 않으려고 둔다.';
comment on column public.satellite_observations.ndvi is
  '잎이 우거진 정도(-1~1). 절대 기준이 선다 — 0.6 이상 빽빽 / 0.2 미만 맨땅';
comment on column public.satellite_observations.ndmi is
  '잎 속 수분(-1~1). ⚠ 절대 기준을 쓰지 말 것. 잎이 성기면 같이 내려가 추세로만 본다';

-- ── 권한 ──────────────────────────────────────────────────────
-- ⚠ Supabase 는 public 스키마에 표가 생기면 default privileges 로 anon·
--   authenticated 에 **ALL 을 자동으로 붙인다**(20260918010000 주석). 새 표는
--   그래서 만들자마자 누구나 지울 수 있는 상태다. 바로 내린다.
--
-- select 도 주지 않는다. **Next 는 이 표를 직접 읽지 않는다** — 위성은 ai-service
-- 를 거쳐서만 나간다. 쓰기는 ai-service 가 postgres 로 직접 하므로 grant 를 안 본다.
revoke all on public.satellite_observations from anon, authenticated;
revoke all on public.satellite_fetches      from anon, authenticated;
