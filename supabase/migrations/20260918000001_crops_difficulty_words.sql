-- crops.difficulty 낱말을 '강·중·약' 에서 '쉬움·보통·어려움' 으로 바꾼다.
--
-- 까닭: 화면(src/features/crops/domain/cropOption.ts toDifficultyLevel)이 이 셋만
-- 알아본다. '쉬움'→1 · '어려움'→3 이고 나머지는 전부 2다. b812355(2026-09-16)에서
-- 칸 이름만 care_level → difficulty 로 바꾸고 값은 원본 척도를 둔 탓에,
-- 그동안 13작물이 전부 "보통"으로 그려지고 있었다.
--
-- 뜻은 그대로 관리 노력이다 — 어려움(거의 매일) · 보통(주 1~2회) · 쉬움(월 1~2회).
-- 2026-09-18 에 『텃밭 디자인』 원문(자료번호 000000295238) 43쪽을 확보해 22작물의
-- 등급을 직접 읽었고, 나머지는 safefarm-crop-data 의 pipeline/difficulty.py 가 추정한다.
--
-- ⚠ 차례가 중요하다. 제약을 먼저 떼지 않으면 update 가 자기 자신에게 막힌다.
-- ⚠ ai-service/app/models/farm/crop.py 의 CheckConstraint 도 같이 바뀌어야 한다.
--    create_all(checkfirst=True) 는 이미 있는 표를 안 고치므로 둘은 따로 논다.

alter table crops drop constraint if exists ck_crops_difficulty;

update crops set difficulty = case difficulty
    when '강' then '어려움'
    when '중' then '보통'
    when '약' then '쉬움'
    else difficulty end
 where difficulty in ('강', '중', '약');

alter table crops add constraint ck_crops_difficulty
    check (difficulty in ('쉬움', '보통', '어려움'));
