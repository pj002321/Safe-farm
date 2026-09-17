-- ─────────────────────────────────────────────────────────────
-- cultivation_events — 사진 자리를 도로 뺀다
--
-- 20260917110000 이 photo_path 와 비공개 버킷까지 같이 만들었지만, 사진을
-- 받아서 할 일이 아직 없다. 쓰지 않는 개인 사진을 쌓아 두는 것 자체가 부담이라
-- 저장 경로를 닫는다 — 메모 기록은 그대로 남는다.
--
-- 업로드는 AI 사진 분석과 한 묶음이라 그 기능을 하는 브랜치에서 되살린다.
-- 그때는 이 마이그레이션의 역순(컬럼 추가 → 버킷 → 정책)을 새 파일로 쓴다.
-- ─────────────────────────────────────────────────────────────

-- ① 제약을 먼저 푼다. photo_path 를 참조하고 있어 컬럼을 못 지운다.
alter table public.cultivation_events
  drop constraint if exists ck_cultivation_events_payload;

alter table public.cultivation_events
  add constraint ck_cultivation_events_payload check (
    case kind
      when 'NOTE'      then body is not null
      when 'TASK_DONE' then body is not null
      when 'STAGE_SET' then stage_order is not null
      when 'FORECAST'  then forecast_on is not null
      else false
    end
  );

-- ② 컬럼. 사진만 있고 메모가 없는 행이 있으면 위 제약에서 이미 걸렸을 테니
--    여기까지 왔다면 지워도 잃을 게 없다.
alter table public.cultivation_events
  drop column if exists photo_path;

-- ── 보관함 정리 ──────────────────────────────────────────────
-- 정책을 남겨 두면 버킷이 없는데 규칙만 도는 상태가 된다.
drop policy if exists cultivation_photos_read_own on storage.objects;
drop policy if exists cultivation_photos_insert_own on storage.objects;
drop policy if exists cultivation_photos_delete_own on storage.objects;

-- 버킷 자체는 SQL 로 못 지운다. storage.protect_delete() 트리거가
-- `delete from storage.objects/buckets` 를 막는다(42501) — 오브젝트만 남고 행이
-- 사라지는 상태를 방지하려는 것이다. 지우려면 대시보드나 Storage API 를 쓴다:
--   Storage → cultivation-photos → Delete bucket
-- 정책이 없으니 authenticated 는 이미 읽지도 쓰지도 못한다. 버킷이 남아 있어도
-- 새는 데는 없고, 사진 기능을 되살릴 때 그대로 다시 쓰면 된다.
