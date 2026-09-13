import { ICON_BASE, type IconProps } from "./types";
import { SunIcon } from "./weather";

/**
 * ---------------------------------------------
 * [Feature]: 인터페이스 아이콘
 *
 * [Description]
 * - 도메인 의미가 없는 조작용 아이콘 묶음. 내비게이션·폼·테마 토글에 쓴다.
 * - SunModeIcon 은 새로 그리지 않고 weather 의 SunIcon 을 별칭으로 내보낸다.
 *   똑같은 해를 두 번 그리면 나중에 한쪽만 고쳐져서 테마 토글과 날씨 카드의
 *   해 모양이 달라진다.
 *
 * [Usage]
 * ```tsx
 * <ArrowRightIcon className="size-4" />
 * <LoaderIcon className="size-4 animate-spin" />
 * ```
 * ---------------------------------------------
 */

/** 테마 토글용 해. weather 의 SunIcon 과 같은 그림이라 별칭만 준다. */
export const SunModeIcon = SunIcon;

/** 오른쪽을 가리키는 화살표 (다음 단계·이동) */
export function ArrowRightIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <path d="M3.5 12h17" />
      <path d="M14 5.5 20.5 12 14 18.5" />
    </svg>
  );
}

/** 오른쪽 위로 빠져나가는 화살표 (외부 링크·새 창) */
export function ArrowUpRightIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <path d="M6.5 17.5 17.5 6.5" />
      <path d="M8.5 6.5h9v9" />
    </svg>
  );
}

/** 완료를 뜻하는 체크 */
export function CheckIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
    </svg>
  );
}

/** 아래를 가리키는 꺾쇠 (펼치기·셀렉트) */
export function ChevronDownIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <path d="M5.5 9 12 15.5 18.5 9" />
    </svg>
  );
}

/** 가로 3줄 메뉴 */
export function MenuIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <path d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17" />
    </svg>
  );
}

/** 닫기를 뜻하는 X */
export function CloseIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <path d="M5.5 5.5 18.5 18.5M18.5 5.5 5.5 18.5" />
    </svg>
  );
}

/** 다크 모드를 뜻하는 초승달 */
export function MoonModeIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <path d="M12 3.5a6.5 6.5 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

/** 재생 삼각형 (데모 영상·시뮬레이션 시작) */
export function PlayIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <path d="M8 5.5 19 12 8 18.5Z" />
    </svg>
  );
}

/** 네 갈래로 뻗은 반짝임 (AI 분석 결과) */
export function SparkleIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <path d="M12 3.5c.9 4.7 3.3 7.1 8 8-4.7.9-7.1 3.3-8 8-.9-4.7-3.3-7.1-8-8 4.7-.9 7.1-3.3 8-8Z" />
    </svg>
  );
}

/** 잠긴 자물쇠 (비공개·인증 필요) */
export function LockIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <rect x="4.5" y="10" width="15" height="10.5" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      <path d="M12 14v3" />
    </svg>
  );
}

/** 봉투 (이메일 입력·연락) */
export function MailIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="M3 7 10.9 12.6a2 2 0 0 0 2.2 0L21 7" />
    </svg>
  );
}

/** 뜬 눈 (비밀번호 보이기) */
export function EyeIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <path d="M2.5 12c2.5-4.33 5.67-6.5 9.5-6.5s7 2.17 9.5 6.5c-2.5 4.33-5.67 6.5-9.5 6.5S5 16.33 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** 사선으로 그어진 눈 (비밀번호 숨기기) */
export function EyeOffIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <path d="M2.5 12c2.5-4.33 5.67-6.5 9.5-6.5s7 2.17 9.5 6.5c-2.5 4.33-5.67 6.5-9.5 6.5S5 16.33 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
      <path d="M4.5 4.5 19.5 19.5" />
    </svg>
  );
}

/** 한쪽이 끊긴 원호. 호출부에서 animate-spin 을 걸어 회전시킨다. */
export function LoaderIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5" />
    </svg>
  );
}
