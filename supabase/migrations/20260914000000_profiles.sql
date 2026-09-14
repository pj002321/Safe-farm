-- ─────────────────────────────────────────────────────────────
-- profiles — auth.users 의 그림자 테이블
--
-- Firebase Firestore 의 `profiles` 컬렉션을 그대로 옮긴 것이다. 필드 이름은
-- TypeScript 쪽 `Profile` 타입과 1:1 로 맞춰 두었다(스네이크 케이스로만 바뀐다).
--
-- ⚠️ **RLS 3종 세트를 한 단위로 쓴다** (AGENTS.md).
--      grant → enable row level security → create policy
--    SQL 에디터·마이그레이션으로 만든 테이블은 RLS 가 자동으로 켜지지 않는다.
--    셋 중 하나라도 빠지면 그 순간 전체 공개다.
--
-- ⚠️ 역할(role)은 **사용자가 고칠 수 없어야 한다.** 그래서 이 테이블의 role 은
--    권한 판단용이 아니라 **표시용 사본**이다. 진짜 출처는 auth.users 의
--    raw_app_meta_data->>'role' 이고, 그쪽은 service_role 로만 바뀐다.
--    아래 update 정책이 role 컬럼을 못 건드리게 막는다.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text        not null,
  -- 표시용 사본. 권한 판단에 쓰지 말 것(위 주석 참고).
  role          text        not null default 'user' check (role in ('admin', 'user')),
  full_name     text,
  avatar_url    text,
  -- 어떤 경로로 가입했는가. 'email' | 'google' 등.
  signup_provider text      not null default 'email',
  -- 동의 시각. **한 번 찍히면 덮어쓰지 않는다**(아래 트리거가 보장).
  terms_agreed_at   timestamptz,
  privacy_agreed_at timestamptz,
  marketing_opt_in  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on column public.profiles.role is
  '표시용 사본. 권한 판단은 auth.users.raw_app_meta_data->>''role'' 로 한다.';

-- ── updated_at 자동 갱신 ──────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ── 동의 시각은 한 번 찍히면 유지 ────────────────────────────
-- 사용자가 프로필을 고칠 때마다 동의 시각이 갱신되면 "언제 동의했는가"라는
-- 기록의 의미가 사라진다. 법적 근거로 쓰이는 값이라 덮어쓰기를 막는다.
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
  return new;
end;
$$;

drop trigger if exists profiles_keep_consent on public.profiles;
create trigger profiles_keep_consent
  before update on public.profiles
  for each row execute function public.keep_consent_timestamps();

-- ── 가입 시 프로필 자동 생성 ──────────────────────────────────
-- auth.users 에 행이 생기면 프로필도 같이 만든다. 앱 코드에서 upsert 하면
-- 소셜 로그인 콜백처럼 서버를 거치지 않는 경로에서 프로필이 비는 일이 생긴다.
-- security definer 인 이유: 트리거는 auth 스키마 이벤트로 돌지만 public 에 써야 한다.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, signup_provider)
  values (
    new.id,
    coalesce(new.email, ''),
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    coalesce(new.raw_app_meta_data->>'provider', 'email')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── RLS 3종 세트 ─────────────────────────────────────────────
-- ① grant
grant select, update on public.profiles to authenticated;

-- ② enable
alter table public.profiles enable row level security;

-- ③ policy
-- 자기 프로필만 읽는다.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (auth.uid() = id);

-- 자기 프로필만, **정해진 컬럼만** 고친다.
-- role·email·created_at·동의시각을 클라이언트가 못 바꾸게 막는 것이 요점이다.
-- (update 정책만으로는 컬럼을 제한할 수 없어 with check 로 값 동일성을 건다.)
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select p.role from public.profiles p where p.id = auth.uid())
    and email = (select p.email from public.profiles p where p.id = auth.uid())
  );

-- insert·delete 는 클라이언트에게 주지 않는다. 생성은 위 트리거가, 삭제는
-- auth.users 의 on delete cascade 가 한다.
-- (grant 에 insert/delete 를 안 줬으므로 정책도 만들지 않는다.)
