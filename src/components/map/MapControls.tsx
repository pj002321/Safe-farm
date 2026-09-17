"use client";

import { LAYER_LABEL, LAYER_SHORT, type Layer } from "./sigunguLayers";

/**
 * ---------------------------------------------
 * [Feature]: 지도 레이어 전환 세그먼트
 *
 * [Description]
 * - 어떤 관측을 지도에 칠할지 고르는 곳. 화면 컴포넌트에서 갈라냈다 —
 *   상태를 갖지 않고 받은 값을 되돌려주기만 한다.
 * - **가로 4등분 그리드다.** 예전엔 `inline-flex` 라 375px 에서 필요 폭이
 *   343px, 가용 폭이 327px 였다. 16px 이 모자라 버튼 넷이 전부 두 줄로
 *   깨졌고 한글이 음절 단위로 끊겼다. 넓은 화면에서는 내용 폭만 쓴다.
 *
 * [Usage]
 * ```tsx
 * <LayerToggle layer={layer} onChange={setLayer} />
 * ```
 * ---------------------------------------------
 */

export function LayerToggle({
  layer,
  onChange,
}: {
  layer: Layer;
  onChange: (layer: Layer) => void;
}) {
  return (
    <div className="grid w-full grid-cols-4 gap-1 rounded-lg border border-border p-1 sm:inline-flex sm:w-fit">
      {(Object.keys(LAYER_LABEL) as Layer[]).map((id) => (
        <button
          aria-pressed={layer === id}
          // min-h-11 = 44px. 예전 py-1.5 는 32px 라 장갑 낀 손으로는 4px 간격의
          // 버튼 넷을 정확히 누르기 어려웠다(WCAG 2.5.5 / HIG 44).
          className={`inline-flex min-h-11 items-center justify-center rounded-md px-3 font-medium text-sm transition-colors duration-200 ease-out-expo ${
            layer === id
              ? "bg-accent text-accent-on"
              : "text-fg-muted hover:bg-surface-2"
          }`}
          key={id}
          onClick={() => onChange(id)}
          type="button"
        >
          {/* 좁으면 짧은 이름, 넓으면 전체 이름. 둘 다 DOM 에 있으므로 검색·
              스크린리더는 전체 이름을 읽는다. */}
          <span className="sm:hidden">{LAYER_SHORT[id]}</span>
          <span className="hidden sm:inline">{LAYER_LABEL[id]}</span>
        </button>
      ))}
    </div>
  );
}
