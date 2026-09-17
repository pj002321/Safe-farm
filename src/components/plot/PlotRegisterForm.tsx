"use client";

import type { ReactNode } from "react";

/**
 * ---------------------------------------------
 * [Feature]: 등록 폼 — 숨은 단계의 필수값을 제출 시점에 대신 검사
 *
 * [Description]
 * - `plots/new` 마법사는 단계마다 패널을 `hidden`(display:none)으로 감춘다.
 *   ⚠️ 처음엔 "숨은(hidden) required 필드는 브라우저가 검사에서 뺀다"고
 *   가정하고 `onSubmit` 에서만 걸렀는데, 실제로는 **반대였다** — Chrome 은
 *   숨어 있어도 `required` 를 그대로 유효성 검사에 넣고, 그중 하나라도 걸리면
 *   `submit` 이벤트 자체를 조용히 막는다(말풍선도 없이, `onSubmit` 도 안
 *   불린다). 그래서 2단계(텃밭 정보)의 면적 입력이 3단계에서 걸리면 버튼이
 *   **아무 반응 없이** 죽어 있었다.
 * - 그래서 폼에 `noValidate` 를 걸어 브라우저의 자동 차단 자체를 끈다. 대신
 *   `onSubmit` 에서 **항상** 면적을 먼저 보고, 비었으면 그 필드가 있는 2단계
 *   라디오를 코드로 체크해 패널을 보이게 만든 다음 `reportValidity()` 를
 *   부른다 — 이제는 렌더된 상태라 브라우저가 원래 보여주는 말풍선이 그대로
 *   뜬다. 면적이 채워져 있으면 나머지(선택한 작물의 파종 여부 등, 항상 3단계
 *   안에서만 필수라 이 시점엔 이미 보인다)는 `form.reportValidity()` 한 번에
 *   맡긴다.
 *
 * [Usage]
 * ```tsx
 * <PlotRegisterForm action={registerPlot} id={FORM_ID}>...</PlotRegisterForm>
 * ```
 * ---------------------------------------------
 */

interface PlotRegisterFormProps {
  id: string;
  action: (formData: FormData) => void | Promise<void>;
  children: ReactNode;
}

export function PlotRegisterForm({
  id,
  action,
  children,
}: PlotRegisterFormProps) {
  return (
    <form
      action={action}
      className="flex flex-col"
      id={id}
      noValidate
      onSubmit={(event) => {
        const form = event.currentTarget;
        const area = form.elements.namedItem("areaM2");
        if (area instanceof HTMLInputElement && !area.value) {
          event.preventDefault();
          const step2 = document.getElementById("wizard-2");
          if (step2 instanceof HTMLInputElement) step2.checked = true;
          // 라디오를 체크해 패널이 화면에 그려진 다음 프레임에 물어봐야
          // `reportValidity()` 가 숨은 요소로 취급하지 않는다.
          requestAnimationFrame(() => area.reportValidity());
          return;
        }

        // 나머지 required(선택한 작물의 파종 여부)는 항상 3단계 패널 안에서만
        // 걸리므로 이 시점엔 이미 보인다 — 네이티브 검사에 그대로 맡긴다.
        if (!form.reportValidity()) event.preventDefault();
      }}
    >
      {children}
    </form>
  );
}
