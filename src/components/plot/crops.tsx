import type { ReactNode } from "react";
import { HarvestIcon, LeafIcon, SproutIcon } from "@/components/icons";

/**
 * ---------------------------------------------
 * [Feature]: 지원 작물 — 단일 출처
 *
 * [Description]
 * - 등록 화면(`CropCards`)·칩(`CropChips`)·지도 마커·홈 카드·상세 화면이 **같은
 *   목록**을 본다. 예전에는 `CropChips` 와 `CropCards` 가 각자 배열을 들고 있었고,
 *   내용이 우연히 같아서 동작했다. 한쪽에만 작물을 더하는 순간 등록은 되는데
 *   홈 카드에서는 "작물 미지정"으로 뜨는 상태가 된다.
 * - **아이콘이 여기 있는 이유.** 밭 카드의 얼굴을 작물에서 가져오기로 했다.
 *   임의로 배정하면 배추밭에 다른 작물 그림이 붙어 화면이 거짓말을 한다.
 *   여기 한 줄이 곧 등록 화면과 목록 화면 양쪽의 그림이 된다.
 * - ⚠️ `CROP_CALENDARS`(features/growth)와 **id 가 맞아야** 생육단계가 나온다.
 *   지금 달력이 있는 것은 `rice`·`cabbage` 둘뿐이고, `persimmon` 은 과수라
 *   파종일 기준 모델이 맞지 않아 일부러 없다 — 단계 배지가 비는 것이 정상이다.
 * - 연동 단계에서 조회 결과로 바뀔 자리다. 그때도 **이 파일 하나만** 갈아 끼운다.
 *
 * [Usage]
 * ```tsx
 * import { CROPS, cropById } from "@/components/plot/crops";
 * cropById("cabbage")?.labelKo;   // "배추"
 * ```
 * ---------------------------------------------
 */

export interface CropOption {
  id: string;
  labelKo: string;
  /** 목록 카드와 선택 카드가 함께 쓰는 그림. */
  icon: ReactNode;
  /** 1=쉬움 2=보통 3=어려움. 점 개수로 그린다. */
  difficulty: 1 | 2 | 3;
  difficultyKo: string;
  /** 씨뿌림에서 수확까지. */
  durationKo: string;
  noteKo: string;
}

export const CROPS: readonly CropOption[] = [
  {
    id: "cabbage",
    labelKo: "배추",
    icon: <LeafIcon />,
    difficulty: 1,
    difficultyKo: "쉬움",
    durationKo: "약 80일",
    noteKo: "가을에 심어 김장까지",
  },
  {
    id: "rice",
    labelKo: "벼",
    icon: <SproutIcon />,
    difficulty: 2,
    difficultyKo: "보통",
    durationKo: "약 150일",
    noteKo: "물 대기 관리가 필요",
  },
  {
    id: "persimmon",
    labelKo: "단감",
    icon: <HarvestIcon />,
    difficulty: 3,
    difficultyKo: "어려움",
    durationKo: "여러 해",
    noteKo: "상주는 북방 한계선",
  },
];

/** id 로 하나 찾는다. 모르는 id 면 `undefined` — 화면이 대체 문구를 정한다. */
export function cropById(
  id: string | null | undefined,
): CropOption | undefined {
  if (!id) return undefined;
  return CROPS.find((crop) => crop.id === id);
}
