import { ICON_BASE, type IconProps } from "./types";

/**
 * ---------------------------------------------
 * [Feature]: 기상 아이콘
 *
 * [Description]
 * - 적합도 계산의 입력이 되는 기상 요소들. 강수 계열(비·우박)은 같은 구름
 *   실루엣을 공유해야 나란히 놓았을 때 무게가 튀지 않는다. 그래서 구름
 *   path 를 상수 하나로 묶어 두 아이콘이 같은 것을 쓴다.
 * - SnowflakeIcon 의 가지는 rotate transform 으로 돌려 쓴다. 6방향 좌표를
 *   손으로 적으면 소수점이 지저분해지고 대칭이 어긋난다.
 *
 * [Usage]
 * ```tsx
 * <CloudRainIcon className="size-5 text-telemetry" />
 * ```
 * ---------------------------------------------
 */

/** 비·우박이 공유하는 구름 실루엣. 아래쪽에 강수 표현 공간을 두려고 밑선을 y=14.5 에 맞췄다. */
const CLOUD_PATH =
  "M17 14.5H8a3.5 3.5 0 0 1-.5-6.96 4.5 4.5 0 0 1 8.6-1.1A4.1 4.1 0 0 1 17 14.5Z";

/** 원판과 8방향 광선으로 이루어진 해 (일조) */
export function SunIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 5V2.5M12 19v2.5M19 12h2.5M5 12H2.5" />
      <path d="M16.95 7.05 18.72 5.28M7.05 7.05 5.28 5.28M16.95 16.95l1.77 1.77M7.05 16.95 5.28 18.72" />
    </svg>
  );
}

/** 구름과 비스듬히 내리는 빗줄기 3개 (강수) */
export function CloudRainIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <path d={CLOUD_PATH} />
      <path d="M9 17l-1.5 3.5M13 17l-1.5 3.5M17 17l-1.5 3.5" />
    </svg>
  );
}

/** 6방향 축과 가지로 이루어진 눈 결정 (한파·냉해) */
export function SnowflakeIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <path d="M12 3v18M4.21 7.5 19.79 16.5M4.21 16.5 19.79 7.5" />
      <path d="M9.8 3.8 12 6l2.2-2.2M9.8 20.2 12 18l2.2 2.2" />
      <path
        d="M9.8 3.8 12 6l2.2-2.2M9.8 20.2 12 18l2.2 2.2"
        transform="rotate(60 12 12)"
      />
      <path
        d="M9.8 3.8 12 6l2.2-2.2M9.8 20.2 12 18l2.2 2.2"
        transform="rotate(-60 12 12)"
      />
    </svg>
  );
}

/** 끝이 말려 올라간 기류 3줄기 (풍속) */
export function WindIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <path d="M3 8h11a2.5 2.5 0 1 0-2.5-2.5" />
      <path d="M3 12.5h15a2.75 2.75 0 1 1-2.75 2.75" />
      <path d="M3 17h8a2.25 2.25 0 1 1-2.25 2.25" />
    </svg>
  );
}

/** 눈금이 달린 관과 구근으로 이루어진 온도계 (기온) */
export function ThermometerIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <path d="M14 13V5a2 2 0 1 0-4 0v8a4 4 0 1 0 4 0Z" />
      <path d="M14 8h2.5M14 11h2.5" />
    </svg>
  );
}

/** 반사광이 들어간 물방울 (습도·강수량) */
export function DropletIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <path d="M12 2.5 6.7 9.6a6.65 6.65 0 1 0 10.6 0Z" />
      <path d="M9 14.5a3 3 0 0 0 2.5 3" />
    </svg>
  );
}

/** 구름과 그 아래로 떨어지는 우박 알갱이 3개 */
export function HailIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <path d={CLOUD_PATH} />
      <circle cx="8.5" cy="18" r="1.1" />
      <circle cx="12" cy="20.2" r="1.1" />
      <circle cx="15.5" cy="18" r="1.1" />
    </svg>
  );
}

/** 중심으로 말려드는 두 갈래 나선 (태풍) */
export function TyphoonIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <path d="M12 3a9 9 0 1 0-8.5 12" />
      <path d="M12 21a9 9 0 1 0 8.5-12" />
      <circle cx="12" cy="12" fill="currentColor" r="1.1" stroke="none" />
    </svg>
  );
}

/** 물결선 아래로 잠긴 집 (침수·홍수) */
export function FloodIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <path d="M5.5 10.5 12 5.5l6.5 5" />
      <path d="M7.5 9v7.5M16.5 9v7.5" />
      <path d="M2.5 15.5q2.38-1.9 4.75 0t4.75 0 4.75 0 4.75 0" />
      <path d="M2.5 19q2.38-1.9 4.75 0t4.75 0 4.75 0 4.75 0" />
    </svg>
  );
}
