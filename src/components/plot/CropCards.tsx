import type { ReactNode } from "react";
import {
  CheckIcon,
  HarvestIcon,
  LeafIcon,
  SproutIcon,
} from "@/components/icons";

/**
 * ---------------------------------------------
 * [Feature]: 작물 카드 복수 선택 (마크업 전용)
 *
 * [Description]
 * - 칩에서 카드로 올렸다. 스펙이 **난이도와 재배 기간을 카드에 표기**하라고 해서,
 *   한 줄짜리 칩으로는 담을 자리가 없다. 처음 짓는 사람이 "배추가 쉬운가"를
 *   고르는 자리이므로 그 정보가 선택 옆에 있어야 한다.
 * - **상태를 JS 로 들고 있지 않는다.** 네이티브 체크박스를 숨기고 `has-[:checked]:`
 *   로 카드 모양만 바꾼다. 키보드·스크린리더·폼 제출이 공짜로 따라온다.
 *   카드 겉모습을 `<label>` 에 거는 이유는 `peer-*` 가 형제 결합자라 "형제의
 *   자식"에는 닿지 않기 때문이다 — 안쪽에 걸면 체크 표시가 영영 안 나온다.
 * - 선택을 **색으로만** 알리지 않는다. 오른쪽 위 체크 표시가 형태로 함께 말한다.
 * - 난이도는 점 세 개로 그린다. "쉬움/보통/어려움" 글자를 함께 두되(스크린리더가
 *   읽는 것은 글자다), 눈으로는 점 개수가 빠르다.
 *
 * [Usage]
 * ```tsx
 * <CropCards defaultSelected={["cabbage"]} />
 * ```
 * ---------------------------------------------
 */

interface CropOption {
  id: string;
  labelKo: string;
  icon: ReactNode;
  /** 1=쉬움 2=보통 3=어려움. 점 개수로 그린다. */
  difficulty: 1 | 2 | 3;
  difficultyKo: string;
  /** 씨뿌림에서 수확까지. */
  durationKo: string;
  noteKo: string;
}

/** 지원 작물. 연동 단계에서 조회 결과로 바뀔 자리다. */
const CROPS: readonly CropOption[] = [
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

interface CropCardsProps {
  /** 폼 필드 이름. 선택한 값이 이 이름으로 여러 개 제출된다. */
  name?: string;
  defaultSelected?: readonly string[];
}

export function CropCards({
  name = "crops",
  defaultSelected = [],
}: CropCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {CROPS.map((crop) => (
        <label
          className="relative flex cursor-pointer flex-col rounded-lg border border-border bg-surface p-4 transition-[border-color,background-color,transform] duration-200 ease-out-expo hover:-translate-y-0.5 hover:border-telemetry has-[:checked]:border-telemetry has-[:checked]:bg-telemetry-subtle has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring has-[:focus-visible]:outline-offset-2"
          key={crop.id}
        >
          <input
            className="peer sr-only"
            defaultChecked={defaultSelected.includes(crop.id)}
            name={name}
            type="checkbox"
            value={crop.id}
          />

          {/* 입력의 형제라야 peer-checked 가 닿는다. 색 말고 형태로도 알린다. */}
          <span className="absolute top-3 right-3 hidden size-5 place-items-center rounded-full bg-telemetry text-accent-on peer-checked:grid">
            <CheckIcon className="size-3" strokeWidth={3} />
          </span>

          <span className="grid size-10 place-items-center rounded-full bg-surface-2 text-xl text-fg-muted">
            {crop.icon}
          </span>

          <span className="mt-3 font-semibold text-[1.05rem] text-fg">
            {crop.labelKo}
          </span>
          <span className="mt-0.5 text-fg-muted text-xs">{crop.noteKo}</span>

          <span className="mt-3 flex items-center gap-2 border-border border-t pt-3">
            <Difficulty level={crop.difficulty} labelKo={crop.difficultyKo} />
            <span className="ml-auto font-mono text-[0.7rem] text-fg-subtle tabular-nums">
              {crop.durationKo}
            </span>
          </span>
        </label>
      ))}
    </div>
  );
}

/**
 * 난이도 표시.
 *
 * 점만 그리면 스크린리더가 아무것도 못 읽는다. 점은 `aria-hidden` 으로 감추고
 * 글자를 함께 둔다 — 눈으로는 점이 빠르고, 읽히는 것은 글자다.
 */
function Difficulty({ level, labelKo }: { level: 1 | 2 | 3; labelKo: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className="flex gap-0.5">
        {[1, 2, 3].map((dot) => (
          <span
            className={`size-1.5 rounded-full ${
              dot <= level ? "bg-caution" : "bg-border-strong"
            }`}
            key={dot}
          />
        ))}
      </span>
      <span className="text-[0.7rem] text-fg-muted">{labelKo}</span>
    </span>
  );
}
