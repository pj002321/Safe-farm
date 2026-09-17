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

/** 돋보기. 목록 검색·필터 입력 옆에 쓴다. */
export function SearchIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m20 20-4.8-4.8" />
    </svg>
  );
}

/** 어깨선 위의 머리. 계정·내 정보. 하단 탭에 쓰려고 추가했다(기존에 사람 아이콘이 없었다). */
export function UserIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}

/**
 * 말풍선 안의 물음표. 물어보기 탭.
 *
 * ⚠️ **말풍선에 호(`A`/`a`)를 쓰지 않는다.** 처음에 원형 말풍선을 호로 그렸다가
 * 되돌렸다. SVG 의 호는 끝점이 반지름과 어긋나면 오류를 내지 않고 **호를 늘려서**
 * 끝점에 닿게 한다 — 손으로 좌표를 잡으면 반드시 어긋나고(실측 7.76 vs 7.5),
 * 원이 조용히 찌그러진다. 모서리를 2차 베지어(`Q`)로 돌리면 좌표가 그대로 그려진다.
 *
 * 꼬리는 **외곽선의 일부**다. 따로 그리면 말풍선의 아래 선이 꼬리를 가로질러
 * 지나간다. 한 path 로 이어야 선 아이콘에서 깨끗하다.
 *
 * 물음표는 말풍선 몸통 가운데(x=12)에 맞췄다. 이전 아이콘은 1.4 만큼 왼쪽으로
 * 치우쳐 있었다.
 */
export function QuestionIcon(props: IconProps) {
  return (
    <svg {...ICON_BASE} aria-hidden="true" {...props}>
      {/* 말풍선 + 꼬리. 직선과 Q 만 쓴다(위 주석 참고). */}
      <path d="M8 4h8q5 0 5 5v4q0 5-5 5h-3l-4 3.5V18H8q-5 0-5-5V9q0-5 5-5Z" />
      {/* 물음표 갈고리. 3차 베지어라 끝점이 그린 대로 간다. */}
      <path d="M9.6 9.4c0-1.6 1.2-2.5 2.5-2.4 1.2.1 2.2 1 2.2 2.2 0 1.8-2.3 2-2.3 3.6" />
      {/* 점. `h.01` 같은 길이 0 트릭은 linecap 에 기대는 꼼수라 쓰지 않는다. */}
      <circle cx="12" cy="15" fill="currentColor" r="0.95" stroke="none" />
    </svg>
  );
}
