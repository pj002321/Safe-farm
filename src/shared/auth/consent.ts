/**
 * ---------------------------------------------
 * [Feature]: 가입 동의 항목 정의 · 검증
 *
 * [Description]
 * - 동의는 **화면과 서버** 두 곳에서 같은 규칙으로 판정돼야 한다. 화면에서만
 *   막으면 세션 생성 요청을 직접 POST 해서 우회할 수 있다. 그래서 판정 규칙을
 *   순수 함수로 여기 모은다.
 * - 기록 경로가 **가입 방식에 따라 둘**이다. 하나로 합치려다 실패한 자리이므로
 *   왜 나뉘는지 적어 둔다:
 *     · 이메일 — `signUp(options.data)` 로 `raw_user_meta_data.consent` 에 실려
 *       가고, `handle_new_user` 트리거가 프로필 행을 만들면서 같이 찍는다.
 *       앱 코드가 끼어들지 않아 **메일 인증 대기 중에도** 기록이 남는다.
 *     · 구글 — OAuth 라 페이지를 떠난다. 위 방법을 쓸 수 없어(공급자 로그인에는
 *       user_metadata 를 실을 자리가 없다) 쿠키에 맡겼다가 `/auth/callback` 이
 *       세션을 만든 직후 기록한다.
 * - 어느 쪽이든 들어오는 값은 **신뢰할 수 없다.** `parseConsent` 가 좁힌다.
 *
 * ⚠️ 알려진 구멍: **`/login` 의 구글 버튼으로 처음 오는 사용자.**
 *   구글은 로그인과 가입을 구분하지 않으므로, 계정이 없는 사람이 로그인 화면의
 *   구글 버튼을 누르면 동의 화면을 거치지 않고 계정이 만들어진다. 이 경우
 *   `terms_agreed_at` 이 null 로 남는다.
 *   ponytail: 지금은 기록이 비는 것으로 끝난다. 제대로 막으려면 로그인 후
 *   `terms_agreed_at` 이 없는 사용자를 동의 화면으로 보내는 온보딩 게이트가
 *   필요하다 — 대시보드에 실제 기능이 붙는 시점에 추가할 것.
 *
 * [Usage]
 * ```ts
 * const consent = parseConsent(body.consent);
 * if (!isConsentComplete(consent)) return Response.json({ error: "consent" }, { status: 400 });
 * await profileRef.set(toConsentMetadata(consent, new Date().toISOString()), { merge: true });
 * ```
 * ---------------------------------------------
 */

export interface Consent {
  /** 서비스 이용약관 (필수) */
  terms: boolean;
  /** 개인정보 수집·이용 (필수) */
  privacy: boolean;
  /** 관측 리포트 외 마케팅 정보 수신 (선택) */
  marketing: boolean;
}

/** 화면에 렌더할 동의 항목. 순서가 곧 표시 순서다. */
export const CONSENT_ITEMS = [
  {
    key: "terms",
    label: "서비스 이용약관에 동의합니다",
    required: true,
    /** 전문 경로. 요약만 보고 동의하지 않도록 화면이 링크를 건다. */
    href: "/terms",
    summary:
      "Safe Farm AI가 제공하는 관측·분석 리포트의 이용 조건과 책임 범위에 대한 동의입니다.",
    detail:
      "리포트는 위성 관측값과 기상 예보를 바탕으로 한 참고 정보입니다. 실제 영농 판단과 그 결과에 대한 책임은 이용자에게 있으며, 회사는 관측·예보 원자료의 오류나 중단으로 인한 손해를 보증하지 않습니다.",
  },
  {
    key: "privacy",
    label: "개인정보 수집·이용에 동의합니다",
    required: true,
    href: "/privacy",
    summary: "수집 항목 · 이용 목적 · 보유 기간을 확인해 주세요.",
    detail:
      "수집 항목: 이메일, 이름, (구글 로그인 시) 프로필 사진 주소, 등록한 농지의 위치와 작물 정보. 이용 목적: 계정 식별, 농지별 생육·재해 리포트 생성과 발송. 보유 기간: 회원 탈퇴 시까지이며, 탈퇴 요청 시 지체 없이 파기합니다. 동의를 거부하실 수 있으나, 그 경우 계정 생성과 리포트 제공이 불가능합니다.",
  },
  {
    key: "marketing",
    label: "마케팅 정보 수신에 동의합니다",
    required: false,
    href: undefined,
    summary: "동의하지 않아도 가입과 관측 리포트 이용에는 영향이 없습니다.",
    detail:
      "신규 기능 안내, 영농 정보 소식지, 이벤트 정보를 이메일로 보내드립니다. 수신 거부는 메일 하단 링크나 설정 화면에서 언제든 가능합니다.",
  },
] as const satisfies readonly {
  key: keyof Consent;
  label: string;
  required: boolean;
  /** 전문 페이지. 없으면(마케팅) 링크를 그리지 않는다. */
  href: string | undefined;
  summary: string;
  detail: string;
}[];

/** 필수 항목이 모두 체크됐는가. 화면과 서버가 같은 판정을 쓴다. */
export function isConsentComplete(consent: Consent): boolean {
  return consent.terms && consent.privacy;
}

/**
 * 신뢰할 수 없는 JSON 조각을 `Consent` 로 좁힌다.
 *
 * **애매하면 전부 false 로 본다.** 객체가 아니거나(null · 배열 · 문자열 · 숫자),
 * 필드가 빠졌거나, 값이 불리언이 아니면(`"true"`, `1`) 그 항목은 동의하지 않은
 * 것이다. 받지 않은 동의를 기록하는 것이 기록하지 않는 것보다 나쁘다 —
 * 전자는 거짓 증거를 만들고, 후자는 동의를 한 번 더 받으면 끝난다.
 * 배열도 `typeof "object"` 이므로 `Array.isArray` 로 따로 걷어낸다.
 */
export function parseConsent(value: unknown): Consent {
  const source =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  return {
    terms: source.terms === true,
    privacy: source.privacy === true,
    marketing: source.marketing === true,
  };
}

/**
 * 계정에 기록할 동의 내역.
 *
 * `agreedAt` 을 인자로 받는 이유: 이 모듈은 순수 함수만 두어야 테스트가 빠르고,
 * 시각은 부르는 쪽(세션 생성 라우트)이 가진 값이기 때문이다.
 */
export function toConsentMetadata(consent: Consent, agreedAt: string) {
  return {
    terms_agreed_at: agreedAt,
    privacy_agreed_at: agreedAt,
    marketing_opt_in: consent.marketing,
  };
}

/**
 * 구글 가입처럼 **페이지를 떠나는** 흐름에서 동의를 잠시 맡겨 두는 쿠키 이름.
 *
 * sessionStorage 가 아니라 쿠키인 이유: 돌아오는 곳이 `/auth/callback` 이라는
 * **서버 라우트**이고, 세션이 거기서 막 만들어진다. 같은 요청 안에서 동의를
 * 기록하려면 서버가 값을 읽을 수 있어야 하는데, sessionStorage 는 브라우저
 * 밖으로 나오지 않는다.
 *
 * ⚠️ `SameSite=Lax` 로 심어야 한다. `Strict` 면 구글에서 돌아오는 **교차 사이트
 *    최상위 이동**에 쿠키가 실리지 않아 콜백이 빈손이 된다.
 */
export const PENDING_CONSENT_COOKIE = "sf-pending-consent";

/** 쿠키에 실을 문자열. */
export function serializeConsent(consent: Consent): string {
  return JSON.stringify({
    terms: consent.terms,
    privacy: consent.privacy,
    marketing: consent.marketing,
  });
}

/**
 * 쿠키에서 읽은 문자열을 `Consent` 로.
 *
 * **던지지 않는다.** 쿠키는 사용자가 고칠 수 있고, 깨진 값 하나로 콜백이 500 을
 * 내면 로그인 자체가 막힌다. 해석에 실패하면 `parseConsent` 와 같은 방침으로
 * "아무것도 동의하지 않음"이 된다 — 받지 않은 동의를 기록하는 것이 기록하지
 * 않는 것보다 나쁘다.
 */
export function deserializeConsent(raw: string | null | undefined): Consent {
  if (!raw) return parseConsent(null);
  try {
    return parseConsent(JSON.parse(raw));
  } catch {
    return parseConsent(null);
  }
}
