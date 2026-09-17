/**
 * ---------------------------------------------
 * [Feature]: 위성 스캔 로딩 — 필지를 훑는 동안 보여주는 화면
 *
 * [Description]
 * - 스피너를 쓰지 않는다. 스피너는 "뭔가 돌고 있다"만 말하고, 이 서비스가 그때
 *   실제로 하는 일(**위성이 밭을 훑어 값을 읽는다**)은 말하지 않는다. 기다리는
 *   시간이 곧 설명이 되게 한다.
 * - **잎사귀·트랙터를 그리지 않는다.** 클립아트로 읽히고, 이 프로젝트의 색 언어는
 *   지구관측 인터페이스다(`FieldGutter`·`FieldPatches` 와 같은 방침). 그래서
 *   불규칙한 **필지 경계**와 **스캔 띠**, 조준용 모서리 괄호만 쓴다.
 *
 * - ⚠️ **모션이 꺼져도 읽혀야 한다.** globals.css 의 전역 블록이
 *   `prefers-reduced-motion` 에서 애니메이션을 0.01ms 로 눌러 즉시 끝 상태로
 *   보낸다. 그래서 설계를 이렇게 했다:
 *     · 필지는 **처음부터 보인다.** 애니메이션이 없어도 그림이 성립한다.
 *     · 움직이는 것은 스캔 띠 **하나뿐**이고, 그게 멈춰도(끝 상태 = 화면 밖)
 *       남는 것은 정지한 위성 사진이다 — 깨진 화면이 아니다.
 *     · `animation-delay` 를 쓰지 않는다. 전역 블록은 duration 만 죽이고
 *       **delay 는 남겨서**, 스태거를 걸면 영영 안 나타나는 조각이 생긴다.
 * - 밝아지는 효과를 **필지마다 주지 않는다.** 띠 하나를 라임으로 덧칠해 지나가게
 *   하면 그 아래 필지가 밝아 보인다 — 움직이는 요소가 하나면 delay 도 필요 없고
 *   필지가 몇 개든 비용이 같다.
 * - 진행률을 **거짓으로 그리지 않는다.** 얼마나 남았는지 모르는 상태라, 퍼센트나
 *   채워지는 막대를 두면 화면이 아는 척을 하게 된다.
 *
 * [Usage]
 * ```tsx
 * <SatelliteScan labelKo="시군구 지도를 불러오는 중" />
 * <SatelliteScan labelKo="밭 예보를 읽는 중" compact />
 * ```
 * ---------------------------------------------
 */

interface SatelliteScanProps {
  /** 지금 무엇을 하고 있는지. 화면과 스크린리더가 같은 문장을 쓴다. */
  labelKo: string;
  /** 한 줄로 낮게 놓는 형태. 카드 안이나 좁은 자리에 쓴다. */
  compact?: boolean;
  className?: string;
}

/**
 * 필지. `FieldGutter` 와 같은 규칙으로 그린다 — 직각을 피하고 변 길이를 흩어
 * 놓는다. 반듯한 사각형이 줄지어 있으면 농지가 아니라 표로 읽힌다.
 */
const PARCELS = [
  "M8 14 L34 9 L38 27 L11 32 Z",
  "M38 8 L62 12 L58 30 L40 27 Z",
  "M64 13 L88 9 L92 30 L60 31 Z",
  "M10 35 L38 30 L42 52 L13 56 Z",
  "M42 30 L60 33 L64 54 L45 52 Z",
  "M66 33 L90 33 L88 55 L67 54 Z",
  "M12 59 L40 55 L44 76 L15 80 Z",
  "M46 56 L66 57 L68 78 L47 77 Z",
  "M70 58 L90 58 L92 79 L71 79 Z",
] as const;

export function SatelliteScan({
  labelKo,
  compact = false,
  className = "",
}: SatelliteScanProps) {
  return (
    // <output> 은 role="status"(aria-live polite)를 이미 갖고 있다. 화면을 떠나
    // 있어도 무엇을 기다리는지 읽힌다. 안쪽 도형은 장식이라 트리에서 뺀다.
    <output
      className={`flex items-center gap-4 ${compact ? "" : "flex-col justify-center py-10 text-center"} ${className}`}
    >
      <span
        aria-hidden="true"
        className={`relative block shrink-0 overflow-hidden rounded-xl border border-border bg-surface-2 ${
          compact ? "size-16" : "size-28"
        }`}
      >
        <svg
          className="block size-full text-earth"
          role="presentation"
          viewBox="0 0 100 88"
        >
          <title>필지 스캔</title>

          {/* 필지. 애니메이션과 무관하게 **항상 보인다** — 모션이 꺼져도 그림이 남는다. */}
          <g
            fill="currentColor"
            fillOpacity="0.14"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeOpacity="0.4"
            strokeWidth="1.2"
          >
            {PARCELS.map((d) => (
              <path d={d} key={d} />
            ))}
          </g>

          {/* 조준 괄호. 정지 상태에서도 "읽는 중"이라는 인상을 남기는 장치다.
              compact 에서는 뺀다 — 56px 로 줄면 모서리에 붙은 점으로만 보여
              그림만 지저분해진다(실측). */}
          {!compact && (
            <g
              className="text-telemetry"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            >
              <path d="M4 16V6h10" />
              <path d="M86 6h10v10" />
              <path d="M96 72v10H86" />
              <path d="M14 82H4V72" />
            </g>
          )}
        </svg>

        {/*
          움직이는 것은 이 띠 하나뿐이다. 라임을 덧칠해 지나가므로 아래 필지가
          밝아 보인다 — 필지마다 애니메이션을 걸 필요가 없다.
          `animate-sweep` 은 globals.css 에 이미 있는 것을 그대로 쓴다.
        */}
        <span className="absolute inset-x-0 top-0 block h-1/2 animate-sweep bg-gradient-to-b from-transparent via-telemetry/35 to-transparent" />

        {/* 스캔선. 띠의 앞머리를 또렷하게 해서 "지금 이 줄을 읽는다"가 보이게 한다. */}
        <span className="absolute inset-x-0 top-0 block h-1/2 animate-sweep">
          <span className="absolute inset-x-0 bottom-0 block h-px bg-telemetry/70" />
        </span>
      </span>

      <span className={compact ? "min-w-0" : ""}>
        <span
          className={`block font-medium text-fg ${compact ? "text-sm" : ""}`}
        >
          {labelKo}
        </span>
        <span className="mt-1 block font-mono text-fg-subtle text-xs">
          위성 관측을 읽는 중입니다
        </span>
      </span>
    </output>
  );
}
