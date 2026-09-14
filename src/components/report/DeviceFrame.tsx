import type { ReactNode } from "react";

/**
 * ---------------------------------------------
 * [Feature]: 기기 프레임 (PC · 모바일)
 *
 * [Description]
 * - 안에 든 화면이 "실제 기기에서 이렇게 보인다"를 말해 주는 껍데기다. 같은 앱을
 *   두 기기로 보여줘야 하므로 프레임만 갈아끼우고 내용은 그대로 둔다.
 * - **실제 제품을 흉내내지 않는다.** 아이폰 노치나 맥북 베젤을 그리면 몇 달 만에
 *   촌스러워지고, 그 기기를 쓰지 않는 사람에게는 오해를 준다. 여기서는 브라우저
 *   크롬(신호등 + 주소 표시줄)과 둥근 모서리라는 **보편적인 기호**만 쓴다.
 * - 신호등 점은 장식이라 `aria-hidden` 이다. 스크린리더가 "빨강 원, 노랑 원"을
 *   읽어봐야 아무 정보도 되지 않는다.
 * - 높이를 프레임이 정하지 않는다. 부모가 준 공간을 자식이 채우고, 스크롤도
 *   자식이 맡는다 — 프레임이 높이를 쥐면 레이아웃이 두 군데서 싸운다.
 *
 * [Usage]
 * ```tsx
 * <DeviceFrame variant="desktop" urlKo="safe-farm.app/today">
 *   <FarmerPanel open={open} />
 * </DeviceFrame>
 * ```
 * ---------------------------------------------
 */

export type DeviceVariant = "desktop" | "mobile";

interface DeviceFrameProps {
  variant: DeviceVariant;
  /** 주소 표시줄에 찍을 문자열. 데스크톱에서만 보인다. */
  urlKo?: string;
  children: ReactNode;
}

export function DeviceFrame({ variant, urlKo, children }: DeviceFrameProps) {
  const isMobile = variant === "mobile";

  return (
    <div
      className={`mx-auto flex min-h-0 w-full flex-col overflow-hidden border border-space-border bg-white/[0.04] shadow-e3 backdrop-blur-sm ${
        isMobile
          ? "max-w-[22rem] rounded-[2rem] p-2"
          : "max-w-5xl rounded-xl p-1.5"
      }`}
    >
      {variant === "desktop" ? (
        <div className="flex shrink-0 items-center gap-2 px-2 pt-1 pb-2">
          <span aria-hidden="true" className="flex gap-1.5">
            <i className="size-2.5 rounded-full bg-unsuitable/70" />
            <i className="size-2.5 rounded-full bg-caution/70" />
            <i className="size-2.5 rounded-full bg-telemetry/70" />
          </span>
          {urlKo && (
            <span className="mx-auto max-w-[60%] truncate rounded-md bg-black/25 px-3 py-1 font-mono text-[0.68rem] text-space-muted">
              {urlKo}
            </span>
          )}
          {/* 신호등과 균형을 맞추는 빈 자리. 없으면 주소창이 왼쪽으로 쏠린다. */}
          <span aria-hidden="true" className="w-[42px]" />
        </div>
      ) : (
        // 모바일은 위쪽 베젤에 스피커 슬릿 하나만. 노치는 그리지 않는다.
        <div
          aria-hidden="true"
          className="mx-auto my-1.5 h-1 w-12 shrink-0 rounded-full bg-space-border"
        />
      )}

      <div
        className={`min-h-0 flex-1 overflow-hidden bg-bg ${
          isMobile ? "rounded-[1.5rem]" : "rounded-lg"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
