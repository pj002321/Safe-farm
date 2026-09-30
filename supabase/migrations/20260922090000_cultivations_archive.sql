-- ─────────────────────────────────────────────────────────────
-- cultivations — 끝난 재배를 아카이브로 만드는 두 칸
--
-- 재배를 끝내면 밭 화면에서 빠져 마이페이지 재배기록으로 간다(교안
-- `교안_내보내기를_한자리로.md`). 거기가 **아카이브**가 되려면 두 가지가 필요했다.
--
-- ① yield_kg — 수확량을 적을 칸이 어디에도 없었다
--    `재배 끝내기` 폼은 버튼 하나뿐이고, 표에도 컬럼이 없어
--    `CultivationRecord.yieldKg` 가 **늘 null** 이었다. 화면의 `— kg` 도,
--    연도별 합계의 `기록 없음` 도 그래서 나오던 값이다.
--    ⚠️ 읽는 쪽은 이미 다 지어져 있다 — 타입·화면·합계(`totalYieldKg`)·CSV 칸.
--       이 컬럼만 차면 저절로 살아난다.
--
-- ② plot_name_at_end — 지난 기록의 밭 이름이 조용히 바뀌고 있었다
--    마이페이지는 `plots!inner(name)` 으로 **조인해서** 밭 이름을 읽는다.
--    그런데 `/plots` 에 이름 고치는 폼이 있어(`updatePlotBasics`), 밭 이름을
--    바꾸면 **지난 기록의 밭 이름까지 통째로 바뀐다.**
--
--    ⚠️ 일지가 날씨를 박아 둔 것과 같은 이유로 박는다 —
--       *"관측이 나중에 정정되면 과거 일지가 소리 없이 바뀐다"*(`eventStore.ts`).
--       보조금·인증 서류로 쓰라고 내보내는 CSV 라, 3월에 뽑은 것과 6월에 뽑은
--       것이 같은 철을 다르게 말하면 안 된다.
--
--    ⚠️ 대가를 알고 고른 것이다 — **오타를 고쳐도 지난 기록엔 옛 이름이 남는다.**
--       아카이브니까 그게 맞다는 판단이다(2026-09-22 사용자 결정).
--
-- 왜 작물 이름은 안 박나:
--    시더의 충돌 키가 `["name"]` 이라(`master_seed_farm_db.py`), 작물 이름을
--    바꾸면 **새 행**이 생기고 옛 행은 그대로 남는다. `crops` 는 prune 도 안 해서
--    이미 심어 둔 재배는 옛 이름을 계속 가리킨다. 박을 이유가 없다.
--
-- 권한 — 20260917 계열의 grant 가 컬럼이 아니라 **테이블 단위**라 새 칸도 그대로
-- 덮인다(실측: anon·authenticated 에 table_privileges 로 select/insert/update).
-- RLS 정책도 plot_id 로만 가르므로 손댈 것이 없다.
-- ─────────────────────────────────────────────────────────────

alter table public.cultivations
  -- 거둔 양(kg). 안 적으면 빈다 — **빈 것이 정상**이다.
  -- ⚠️ 0 과 null 은 다른 값이다. `0kg` 은 흉작이고 `null` 은 안 적은 것이라,
  --    합계(`sumYield`)가 "하나도 없으면 null" 로 둘을 가른다.
  -- numeric 인 까닭은 소수를 받기 때문이다 — 412.5kg 같은 값이 온다.
  add column if not exists yield_kg numeric,

  -- 끝낸 그 시점의 밭 이름. 비어 있으면 읽는 쪽이 조인값으로 떨어진다
  -- (`plot_name_at_end ?? plots.name`).
  -- ⚠️ **기르는 중인 재배는 비어 있는 것이 정상이다.** 박을 시점이 아직 안 왔다.
  add column if not exists plot_name_at_end text;

-- 이미 끝난 건에 지금 이름을 채운다.
--
-- ⚠️ 안 채우면 그 건들만 계속 조인값으로 떨어져, 나중에 밭 이름을 고쳤을 때
--    조용히 바뀐다 — 이 마이그레이션이 막으려던 바로 그 일이다.
-- ⚠️ 한 번만 채운다(`is null` 조건). 다시 돌려도 이미 박힌 값을 덮지 않는다.
update public.cultivations c
   set plot_name_at_end = p.name
  from public.plots p
 where p.id = c.plot_id
   and c.plot_name_at_end is null
   and c.status in ('HARVESTED', 'FAILED');
