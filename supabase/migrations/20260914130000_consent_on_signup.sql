-- ─────────────────────────────────────────────────────────────
-- 가입 동의를 프로필 행에 기록한다.
--
-- [문제]
-- 20260914000000_profiles.sql 의 handle_new_user 는 id·email·full_name·
-- avatar_url·signup_provider 만 채웠다. 그래서 동의 3개 컬럼
-- (terms_agreed_at · privacy_agreed_at · marketing_opt_in)이 **한 건도**
-- 채워지지 않았다. 앱 쪽 recordConsent() 는 정의만 있고 부르는 곳이 없었다.
-- 화면에서 필수 동의를 받아 놓고 기록이 남지 않는 상태였다.
--
-- [고침]
-- 이메일 가입은 `signUp(options.data)` 로 동의가 이미
-- `auth.users.raw_user_meta_data.consent` 에 실려 온다. 트리거가 그걸 읽는다.
--
-- 앱 코드가 아니라 트리거에 두는 이유:
--   · 프로필 행이 만들어지는 바로 그 순간 찍히므로 "행은 있는데 동의는 없는"
--     중간 상태가 아예 생기지 않는다.
--   · **메일 인증이 켜져 있어도 기록된다.** 그 경우 가입 직후 사용자는 아직
--     로그인 상태가 아니어서, 앱에서 기록하려면 세션이 없어 쓸 수가 없다.
--
-- 구글 가입은 이 경로를 타지 않는다. OAuth 공급자 로그인에는 user_metadata 를
-- 실을 자리가 없어서, 쿠키에 맡겼다가 /auth/callback 이 기록한다.
--
-- [남은 구멍 — 그대로 둔다]
-- /login 의 구글 버튼으로 처음 오는 사용자는 동의 화면을 거치지 않는다.
-- 구글은 로그인과 가입을 구분하지 않기 때문이다. 이 경우 세 컬럼이 null 로
-- 남는다. 막으려면 terms_agreed_at 이 없는 사용자를 동의 화면으로 보내는
-- 온보딩 게이트가 필요하다 — 대시보드에 실제 기능이 붙을 때 함께 만든다.
-- 이 마이그레이션은 그 조회(`terms_agreed_at is null`)가 참이 되게 하는 것까지가 몫이다.
-- ─────────────────────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- 없으면 null 이다(구글 등). 아래 표현식들이 전부 null 을 통과시키므로
  -- 별도 분기가 필요 없다.
  v_consent jsonb := new.raw_user_meta_data->'consent';
  v_now timestamptz := now();
begin
  insert into public.profiles (
    id, email, full_name, avatar_url, signup_provider,
    terms_agreed_at, privacy_agreed_at, marketing_opt_in
  )
  values (
    new.id,
    coalesce(new.email, ''),
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    coalesce(new.raw_app_meta_data->>'provider', 'email'),
    -- `->>` 는 jsonb 불리언 true 를 문자열 'true' 로 준다. 문자열 "true" 를
    -- 넣어 보낸 경우도 같은 값이 되지만, 어느 쪽이든 **사용자가 동의했다고
    -- 주장한 것**이라 구분할 실익이 없다.
    -- 동의하지 않았거나 값이 없으면 null 이다 — 거짓 기록을 만들지 않는다.
    case when v_consent->>'terms' = 'true' then v_now end,
    case when v_consent->>'privacy' = 'true' then v_now end,
    -- 선택 항목. 없으면 false(수신 거부)가 안전한 기본값이다.
    coalesce(v_consent->>'marketing' = 'true', false)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

comment on function public.handle_new_user() is
  '가입 시 프로필 행 생성. raw_user_meta_data.consent 가 있으면 동의도 함께 기록한다(이메일 가입 경로).';
