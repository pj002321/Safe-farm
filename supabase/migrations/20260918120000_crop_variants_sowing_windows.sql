-- crop_variants 에 씨앗/모종 파종 창을 따로 담는다.
--
-- 까닭: 등록 폼에 씨앗/모종 라디오가 있는데 안내 문구는 `sow_from`~`sow_to` 하나뿐이었다.
-- 벼가 그 차이를 드러낸다 — 못자리 4.중~5.중, 모내기 5.중~6.중으로 한 달 떨어져 있어
-- 씨앗을 고른 사람에게 모내기 시기를 말하고 있었다.
--
-- ⚠ `sow_method`·`sow_from`·`sow_to` 는 **그대로 둔다.** 지금 화면이 그것을 쓴다.
--    화면이 새 칸으로 옮겨 탄 뒤에 정리한다.
-- ⚠ 한쪽이 비는 것이 정상이다 — 직파(감자·시금치)는 plant_*, 씨로 안 심는 작물(딸기)은 seed_* 가 빈다.
--    그래서 NOT NULL 을 걸지 않는다.
-- ⚠ ai-service/app/models/farm/crop_variant.py 의 Column 넷과 같이 가야 한다.
--    create_all(checkfirst=True) 는 이미 있는 표를 안 고치므로 둘은 따로 논다.

alter table crop_variants
    add column if not exists seed_from  text,
    add column if not exists seed_to    text,
    add column if not exists plant_from text,
    add column if not exists plant_to   text;
