-- ─────────────────────────────────────────────────────────────
-- 위치정보 이용동의를 프로필에 기록한다.
--
-- [왜 개인정보 동의와 따로 받는가]
-- 위치정보는 수집 주체와 이용 목적이 개인정보와 달라 별도의 고지·동의를
-- 요구받는다. 한 컬럼에 뭉뚱그리면 "무엇에 동의했는지"를 나중에 증명할 수 없다.
--
-- 이 서비스는 밭 좌표가 없으면 리포트를 만들 수 없어 **필수 동의**다
-- (src/shared/auth/consent.ts 의 isConsentComplete).
--
-- ⚠️ 이 마이그레이션을 올리면 **이미 가입한 모든 사용자가 온보딩 게이트에
--    걸린다.** 그들은 위치정보에 동의한 적이 없으므로 맞는 동작이고, 게이트가
--    있는 이유이기도 하다. 동의 화면을 한 번 지나면 다시 뜨지 않는다.
-- ─────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists location_agreed_at timestamptz;

comment on column public.profiles.location_agreed_at is
  '위치기반서비스 이용약관 동의 시각. 개인정보 동의와 별도로 받는다.';

-- ── 최초 동의 시각 보존 ───────────────────────────────────────
-- 기존 트리거가 terms·privacy 만 보고 있었다. location 을 빼먹으면 이 컬럼만
-- 갱신 때마다 덮어써져, 셋 중 하나만 "마지막 동의 시각"이 되어 어긋난다.
create or replace function public.keep_consent_timestamps()
returns trigger
language plpgsql
as $$
begin
  if old.terms_agreed_at is not null then
    new.terms_agreed_at := old.terms_agreed_at;
  end if;
  if old.privacy_agreed_at is not null then
    new.privacy_agreed_at := old.privacy_agreed_at;
  end if;
  if old.location_agreed_at is not null then
    new.location_agreed_at := old.location_agreed_at;
  end if;
  return new;
end;
$$;

-- ── 가입 시 동의 기록 ─────────────────────────────────────────
-- 이메일 가입은 signUp(options.data) 로 동의가 raw_user_meta_data.consent 에
-- 실려 온다. 구글은 그 자리가 없어 /auth/callback 이 쿠키로 받아 기록한다.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consent jsonb := new.raw_user_meta_data->'consent';
  v_now timestamptz := now();
begin
  insert into public.profiles (
    id, email, full_name, avatar_url, signup_provider,
    terms_agreed_at, privacy_agreed_at, location_agreed_at, marketing_opt_in
  )
  values (
    new.id,
    coalesce(new.email, ''),
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    coalesce(new.raw_app_meta_data->>'provider', 'email'),
    -- 동의하지 않았거나 값이 없으면 null 이다 — 거짓 기록을 만들지 않는다.
    case when v_consent->>'terms' = 'true' then v_now end,
    case when v_consent->>'privacy' = 'true' then v_now end,
    case when v_consent->>'location' = 'true' then v_now end,
    coalesce(v_consent->>'marketing' = 'true', false)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

comment on function public.handle_new_user() is
  '가입 시 프로필 행 생성. raw_user_meta_data.consent 가 있으면 동의(약관·개인정보·위치)도 함께 기록한다.';
