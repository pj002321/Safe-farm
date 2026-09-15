import type { CultivationRecord } from "@/features/plots/domain/cultivationRecord";

/**
 * ---------------------------------------------
 * [Feature]: 지난 재배 기록 퍼블용 고정 데이터
 *
 * [Description]
 * - ⚠️ **이 파일은 지워질 파일이다.** 재배 기록은 저장소가 아직 없어서(화면만
 *   만드는 범위) 모양을 눈으로 확인하려고 둔 고정값이다. 조회가 붙으면 통째로
 *   사라진다. 로직을 여기 넣지 말 것 — 계산은 `cultivationRecord.ts` 에 있다.
 *   (`components/dashboard/sample.ts` 와 같은 자리·같은 방침이다.)
 * - 값을 일부러 **가지런하지 않게** 뒀다. 수확량을 안 적은 해가 있고, 메모가 없는
 *   줄이 있고, 해를 넘겨 거두는 작물(마늘)이 하나 있다. 예쁜 데이터만 넣으면
 *   줄바꿈·빈 칸·연도 묶기가 깨지는 자리를 퍼블 단계에서 못 본다.
 * - 날짜는 `Date` 가 아니라 문자열이다. 실행 시각에 따라 화면이 달라지면
 *   "어제는 되던 화면"이 생겨 디자인 검토가 불가능해진다.
 * ---------------------------------------------
 */

export const SAMPLE_RECORDS: readonly CultivationRecord[] = [
  {
    id: "r-2026-cabbage",
    plotKo: "배추밭",
    cropKo: "배추",
    sowingDate: "2026-08-20",
    harvestDate: "2026-11-05",
    yieldKg: 412.5,
    noteKo: "결구기에 물을 늦게 줘서 속이 덜 찼습니다. 내년에는 9월 중순에.",
  },
  {
    id: "r-2026-garlic",
    // 가을에 심어 이듬해 봄에 거둔다. 파종 연도로 묶으면 2025년 칸에 들어가
    // 버리는 값이라, 연도 묶기가 수확일 기준인지 확인하는 표본이다.
    plotKo: "윗밭",
    cropKo: "마늘",
    sowingDate: "2025-10-12",
    harvestDate: "2026-06-08",
    yieldKg: 88,
    noteKo: null,
  },
  {
    id: "r-2026-lettuce",
    plotKo: "비닐하우스",
    cropKo: "상추",
    sowingDate: "2026-03-02",
    harvestDate: "2026-04-28",
    // 안 적은 해. 합계가 "적힌 것만" 더하는지 보는 표본이다.
    yieldKg: null,
    noteKo: "솎아내기를 두 번 했습니다.",
  },
  {
    id: "r-2025-rice",
    plotKo: "낙동강변 논",
    cropKo: "벼",
    sowingDate: "2025-05-18",
    harvestDate: "2025-10-09",
    yieldKg: 1240,
    noteKo: null,
  },
  {
    id: "r-2025-cabbage",
    plotKo: "배추밭",
    cropKo: "배추",
    sowingDate: "2025-08-25",
    harvestDate: "2025-11-12",
    yieldKg: 388,
    noteKo: "9월 태풍에 겉잎이 상했지만 수확량은 비슷했습니다.",
  },
  {
    id: "r-2024-persimmon",
    plotKo: "단감 과수원",
    cropKo: "단감",
    sowingDate: "2024-04-01",
    harvestDate: "2024-10-25",
    yieldKg: 0,
    // 0kg 흉작. "안 적음(null)" 과 다른 값이라는 걸 화면에서 구별하는지 보는 표본.
    noteKo: "서리가 일찍 내려 그해는 거의 못 거뒀습니다.",
  },
];
