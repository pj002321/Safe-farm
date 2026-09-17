-- ─────────────────────────────────────────────────────────────
-- cultivation_events — 재배 한 건에 붙는 기록 한 줄
--
-- 파종·수확·실패는 여기 넣지 않는다. 그 셋은 이미 cultivations 의
-- sowing_date / harvested_at / failed_at 에 있고, 같은 사실을 두 곳에 두면
-- 한쪽만 고쳐졌을 때 어느 쪽이 맞는지 알 수 없다.
-- 타임라인은 읽을 때 두 출처를 합친다(features/cultivations/domain/timeline.ts).
--
-- 그래서 kind 는 **다른 곳에 자리가 없는 것**만 담는다:
--   NOTE      사용자 메모(+사진)
--   TASK_DONE 추천 작업을 했다고 표시
--   STAGE_SET 생육단계 수동 보정
--   FORECAST  그때 계산한 수확 예측일. 나중에 실제 수확일과 비교해 오차를 낸다
--
-- ⚠️ **RLS 3종 세트를 한 단위로 쓴다** (AGENTS.md):
--      grant → enable row level security → create policy
-- ─────────────────────────────────────────────────────────────

create table if not exists public.cultivation_events (
  id              uuid primary key default gen_random_uuid(),
  cultivation_id  uuid not null references public.cultivations(id) on delete cascade,

  kind            text not null
                  check (kind in ('NOTE', 'TASK_DONE', 'STAGE_SET', 'FORECAST')),

  -- 타임라인의 정렬 축. "언제 있었던 일인가"지 "언제 입력했는가"가 아니다.
  -- 어제 일을 오늘 적는 경우가 흔해서 created_at 으로 대신할 수 없다.
  occurred_on     date not null,

  -- NOTE 의 본문이자 TASK_DONE 의 작업 이름. 두 컬럼으로 나누지 않는다 —
  -- 화면이 하는 일이 "한 줄 보여주기"로 같다.
  body            text,

  -- Storage 오브젝트 경로. 버킷 안 경로만 담고 서명 URL 은 조회 때 만든다.
  -- 공개 URL 을 저장하면 버킷을 비공개로 되돌려도 이미 나간 주소가 살아 있다.
  photo_path      text,

  -- STAGE_SET 이 가리키는 crop_stages.stage_order.
  -- 품종 FK 를 걸지 않는다 — cultivations.variant_id 가 바뀌면 복합 FK 가 막아
  -- 품종 정정 자체를 못 하게 된다. 없는 단계는 읽을 때 걸러진다.
  stage_order     smallint,

  -- FORECAST 가 그때 내다본 수확 도달일.
  forecast_on     date,

  created_at      timestamptz not null default now(),

  -- 지운 메모도 행은 남긴다(plots·cultivations 와 같은 방침).
  deleted_at      timestamptz,

  -- kind 마다 있어야 할 값이 다르다. 없으면 빈 줄이 타임라인에 그려진다.
  constraint ck_cultivation_events_payload check (
    case kind
      when 'NOTE'      then body is not null or photo_path is not null
      when 'TASK_DONE' then body is not null
      when 'STAGE_SET' then stage_order is not null
      when 'FORECAST'  then forecast_on is not null
      else false
    end
  )
);

-- 타임라인은 늘 "이 재배의 기록을 최신순으로" 읽는다.
create index if not exists cultivation_events_timeline_idx
  on public.cultivation_events (cultivation_id, occurred_on desc)
  where deleted_at is null;

-- ── RLS 3종 세트 ─────────────────────────────────────────────
-- ① grant
grant select, insert, update, delete on public.cultivation_events to authenticated;

-- ② enable
alter table public.cultivation_events enable row level security;

-- ③ policy
-- user_id 가 없다. cultivations → plots 를 두 단계 타고 소유자를 확인한다.
-- 기록 수가 적어 exists 로 충분하다 — cultivations_select_own 과 같은 방침이다.
drop policy if exists cultivation_events_select_own on public.cultivation_events;
create policy cultivation_events_select_own on public.cultivation_events
  for select to authenticated
  using (exists (
    select 1
      from public.cultivations c
      join public.plots p on p.id = c.plot_id
     where c.id = cultivation_events.cultivation_id
       and p.user_id = auth.uid()
  ));

drop policy if exists cultivation_events_insert_own on public.cultivation_events;
create policy cultivation_events_insert_own on public.cultivation_events
  for insert to authenticated
  with check (exists (
    select 1
      from public.cultivations c
      join public.plots p on p.id = c.plot_id
     where c.id = cultivation_events.cultivation_id
       and p.user_id = auth.uid()
  ));

-- using 은 고칠 행을 고르고 with check 는 고친 뒤 값을 본다. with check 가
-- 없으면 자기 메모를 남의 재배로 옮길 수 있다.
drop policy if exists cultivation_events_update_own on public.cultivation_events;
create policy cultivation_events_update_own on public.cultivation_events
  for update to authenticated
  using (exists (
    select 1
      from public.cultivations c
      join public.plots p on p.id = c.plot_id
     where c.id = cultivation_events.cultivation_id
       and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1
      from public.cultivations c
      join public.plots p on p.id = c.plot_id
     where c.id = cultivation_events.cultivation_id
       and p.user_id = auth.uid()
  ));

-- 삭제는 soft delete 라 update 로 도는데, 정책을 안 두면 실제 delete 가 막히지
-- 않은 채 남는다. 행을 지우는 길 자체를 닫는다.
drop policy if exists cultivation_events_delete_own on public.cultivation_events;
create policy cultivation_events_delete_own on public.cultivation_events
  for delete to authenticated
  using (false);


-- ── 사진 보관함 ──────────────────────────────────────────────
-- 비공개 버킷이다. 관찰 사진에는 밭 주변과 사람이 찍힌다 — 공개로 두면 경로만
-- 알면 누구나 본다. 화면은 조회할 때마다 짧은 서명 URL 을 만들어 쓴다.
insert into storage.buckets (id, name, public)
values ('cultivation-photos', 'cultivation-photos', false)
on conflict (id) do nothing;

-- 경로 규칙: `{auth.uid()}/{cultivation_id}/{파일명}`
-- 첫 칸이 소유자라 정책이 문자열 비교 하나로 끝난다. cultivations 를 조인해
-- 확인하는 방법도 있지만, storage 정책에서 조인을 돌리면 업로드마다 그 값을 탄다.
drop policy if exists cultivation_photos_read_own on storage.objects;
create policy cultivation_photos_read_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'cultivation-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists cultivation_photos_insert_own on storage.objects;
create policy cultivation_photos_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'cultivation-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists cultivation_photos_delete_own on storage.objects;
create policy cultivation_photos_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'cultivation-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
