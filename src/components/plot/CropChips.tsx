import type { ReactNode } from "react";
import {
  CheckIcon,
  HarvestIcon,
  LeafIcon,
  SproutIcon,
} from "@/components/icons";

/**
 * ---------------------------------------------
 * [Feature]: 작물 복수 선택 칩 (마크업 전용)
 *
 * [Description]
 * - **상태를 JS 로 들고 있지 않는다.** 네이티브 `<input type="checkbox">` 를 숨겨 두고
 *   CSS 로 칩의 모양만 바꾼다. 이 방식이면 키보드(Tab·Space), 스크린리더,
 *   폼 제출(`name="crops"` 로 여러 값), 초기 선택값이 전부 공짜로 따라온다.
 *   Checkbox.tsx 가 이미 쓰는 방식이라 코드베이스 안에서도 일관된다.
 *   그래서 이 파일은 서버 컴포넌트다 — 번들에 JS 가 실리지 않는다.
 * - **칩의 겉모습을 `<label>` 자체에 건다.** 안쪽 span 에 걸고 체크 표시를 그 안에
 *   넣으면 `peer-checked:` 가 듣지 않는다 — `peer-*` 는 형제 결합자(`~`)라
 *   "형제의 자식"에는 닿지 않기 때문이다. 그래서 라벨은 `has-[:checked]:` 로,
 *   입력과 형제인 체크 표시는 `peer-checked:` 로 각각 건다.
 * - 선택 상태를 **색으로만** 알리지 않는다. 체크 표시가 함께 들어가야 색을 구분하기
 *   어려운 사용자도 무엇이 선택됐는지 안다.
 * - 선택색은 telemetry(라임)다. 화면의 다른 강조가 accent(인디고)라, 작물 선택만
 *   다른 색을 써야 "여러 개 고르는 칸"이라는 성격이 눈에 들어온다.
 *
 * [Usage]
 * ```tsx
 * <CropChips defaultSelected={["cabbage"]} />
 * ```
 * ---------------------------------------------
 */

interface CropOption {
  id: string;
  labelKo: string;
  icon: ReactNode;
}

/** 참고 시안이 제시한 세 작물. 연동 단계에서 조회 결과로 바뀔 자리다. */
const CROPS: readonly CropOption[] = [
  { id: "rice", labelKo: "벼", icon: <SproutIcon /> },
  { id: "cabbage", labelKo: "배추", icon: <LeafIcon /> },
  { id: "persimmon", labelKo: "단감", icon: <HarvestIcon /> },
];

interface CropChipsProps {
  /** 폼 필드 이름. 선택한 값이 이 이름으로 여러 개 제출된다. */
  name?: string;
  /** 처음부터 눌려 있을 작물 id. 퍼블 검토용 초기값으로도 쓴다. */
  defaultSelected?: readonly string[];
}

export function CropChips({
  name = "crops",
  defaultSelected = [],
}: CropChipsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {CROPS.map((crop) => (
        <label
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-2 font-medium text-fg-muted text-sm transition-colors duration-200 ease-out-expo hover:border-telemetry hover:text-fg has-[:checked]:border-telemetry has-[:checked]:bg-telemetry-subtle has-[:checked]:text-telemetry has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring has-[:focus-visible]:outline-offset-2"
          key={crop.id}
        >
          <input
            className="peer sr-only"
            defaultChecked={defaultSelected.includes(crop.id)}
            name={name}
            type="checkbox"
            value={crop.id}
          />
          {crop.icon}
          {crop.labelKo}
          {/* 입력의 형제라야 peer-checked 가 닿는다. 색 말고 형태로도 상태를 알린다. */}
          <CheckIcon
            aria-hidden="true"
            className="hidden size-3.5 peer-checked:block"
            strokeWidth={3}
          />
        </label>
      ))}
    </div>
  );
}
