import { FieldIcon } from "@/components/icons";
import { Field } from "@/components/shared/Field";

/**
 * ---------------------------------------------
 * [Feature]: 텃밭 정보 입력 — 이름 · 면적 (마크업 전용)
 *
 * [Description]
 * - 면적은 **평과 ㎡ 를 둘 다 받는다.** 농민은 평으로 아시는 경우가 많은데
 *   ㎡ 로만 받으면 입력할 때마다 암산하게 된다. 단위는 값 옆에 붙여야
 *   "무엇을 적는 칸인지"가 한눈에 들어온다.
 * - 면적은 **필수다.** 예전엔 건너뛸 수 있었는데, 3단계(작물 선택)까지
 *   넘어가면 되돌아와 채울 이유가 없어 빈 채로 등록이 끝났다. 이 `required` 는
 *   `PlotRegisterForm` 의 제출 가드가 본다 — 이 단계 패널이 제출 시점엔 CSS로
 *   숨어 있어(`hidden`) 브라우저 자체 검증에서는 빠지기 때문이다.
 * - 정확한 숫자를 요구하지는 않는다. "어림잡으셔도 된다"는 문구는 그대로
 *   둔다 — 부담을 낮추는 것과 아예 안 적고 넘어가는 것은 다르다.
 * - 면적을 왜 묻는지 적어 둔다. 쓰임을 모르면 정확히 적어야 하나 고민하다
 *   그냥 건너뛴다.
 *
 * [Usage]
 * ```tsx
 * <PlotInfoFields />
 * ```
 * ---------------------------------------------
 */

export function PlotInfoFields() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field
        icon={<FieldIcon />}
        label="텃밭 이름"
        name="name"
        placeholder="예: 낙동강변 배추밭"
      />

      <div className="flex flex-col gap-1.5">
        <label className="font-medium text-fg text-sm" htmlFor="plot-area">
          대략 면적
        </label>
        <div className="flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2.5 text-fg placeholder:text-fg-subtle transition-colors hover:border-accent focus:border-accent"
            id="plot-area"
            inputMode="numeric"
            name="areaM2"
            placeholder="예: 200"
            required
            type="number"
          />
          <select
            aria-label="면적 단위"
            className="shrink-0 rounded-md border border-border bg-surface px-3 py-2.5 text-fg text-sm transition-colors hover:border-accent focus:border-accent"
            defaultValue="pyeong"
            name="areaUnit"
          >
            <option value="pyeong">평</option>
            <option value="m2">㎡</option>
          </select>
        </div>
        <p className="text-fg-muted text-xs">
          어림잡으셔도 됩니다. 물 주는 양을 가늠하는 데만 씁니다.
        </p>
      </div>
    </div>
  );
}
