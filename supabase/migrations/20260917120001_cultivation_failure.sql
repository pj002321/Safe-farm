-- ─────────────────────────────────────────────────────────────
-- cultivations — 재배 실패 기록
--
-- status 의 체크 제약에 'FAILED' 는 처음부터 있었지만 담을 자리가 없었다.
-- "언제" 와 "왜" 가 없으면 실패 상태는 목록에서 사라지는 것과 다를 바 없다.
--
-- 사유를 자유 입력으로 받지 않는다. 이탈 지점을 세려면 집계가 되어야 하고,
-- 자유 입력은 같은 뜻이 열 가지 문장으로 들어온다. 선택지가 모자라면 OTHER
-- 비율을 보고 늘린다.
-- ─────────────────────────────────────────────────────────────

alter table public.cultivations
  add column if not exists failed_at date;

alter table public.cultivations
  add column if not exists failure_reason text;

-- 이미 있는 행에는 둘 다 null 이라 not valid 없이 바로 건다.
alter table public.cultivations
  drop constraint if exists ck_cultivations_failure_reason;

alter table public.cultivations
  add constraint ck_cultivations_failure_reason check (
    failure_reason is null
    or failure_reason in (
      'PEST',      -- 병해충
      'DISEASE',   -- 생리장해
      'WEATHER',   -- 기상(한파·폭염·태풍)
      'WATER',     -- 물 관리 (과습·건조)
      'NUTRIENT',  -- 양분 (비료·토양)
      'SEED',      -- 씨앗·모종 불량
      'MANAGE',    -- 돌보지 못함
      'OTHER'
    )
  );

-- 끝난 재배는 끝난 날이 있어야 한다. 실패인데 날짜가 없으면 타임라인에
-- 놓을 자리가 없고, 실패가 아닌데 날짜만 있으면 목록이 상태와 어긋난다.
alter table public.cultivations
  drop constraint if exists ck_cultivations_failed_at;

alter table public.cultivations
  add constraint ck_cultivations_failed_at check (
    (status = 'FAILED') = (failed_at is not null)
  );

comment on column public.cultivations.failure_reason is
  '실패 사유 코드. 화면 문구는 features/cultivations/domain/failureReason.ts 가 가진다.';
