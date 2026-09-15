import type { Role } from "./session";

/**
 * ---------------------------------------------
 * [Feature]: 사용자 프로필 — 타입과 순수 변환
 *
 * [Description]
 * - `auth.users` 는 Supabase 가 관리하므로 우리가 컬럼을 늘릴 수 없다. 서비스가
 *   필요한 값(동의 시각, 표시 이름 등)은 이 그림자 테이블에 둔다.
 * - **행 생성은 DB 트리거가 한다**(`on_auth_user_created`). 앱에서 upsert 하면
 *   OAuth 콜백처럼 우리 코드를 거치지 않는 경로에서 프로필이 비는 일이 생긴다.
 *   그래서 여기에는 **읽기와 사용자 편집**만 있다.
 * - `role` 컬럼은 **표시용 사본**이다. 권한 판단은 언제나 `session.ts` 의
 *   `Viewer.role`(= 토큰의 `app_metadata.role`)로 한다. RLS 가 클라이언트 쓰기를
 *   막고 있지만, 규칙이 한 번 헐거워지면 그 순간 권한 상승 경로가 된다.
 * - 날짜는 문자열(ISO)로 내보낸다. Server Component 에서 Client Component 로
 *   넘길 때 Date 객체는 직렬화 경계에서 문자열이 되므로, 타입이 거짓말하지 않게
 *   처음부터 문자열로 맞춘다.
 *
 * - **DB 접근은 여기 없다.** `profileStore.ts` 에 있다. 순수 함수만 남긴 이유는
 *   테스트 때문이다 — 서버 클라이언트를 import 하면 `server-only` 가 vitest 에서
 *   던져서 순수 변환조차 검증할 수 없게 된다. AGENTS.md 의 "테스트는 순수 함수에만"
 *   과 같은 방향이다.
 *
 * [Usage]
 * ```ts
 * const profile = toProfile(row);
 * displayNameOf(profile);
 * ```
 * ---------------------------------------------
 */

/** 테이블 이름. 쿼리에 문자열을 흩뿌리지 않는다. */
export const PROFILES_TABLE = "profiles";

/** 화면이 쓰는 모양. 날짜는 전부 ISO 문자열. */
export interface Profile {
  id: string;
  email: string;
  role: Role;
  fullName: string | null;
  avatarUrl: string | null;
  signupProvider: string;
  termsAgreedAt: string | null;
  privacyAgreedAt: string | null;
  locationAgreedAt: string | null;
  marketingOptIn: boolean;
  createdAt: string;
}

/**
 * DB 행 모양(스네이크 케이스). 이 타입이 스키마와의 **유일한 계약**이다.
 *
 * `profileStore.ts` 가 같은 모양을 따로 선언해 두고 있었는데, 컬럼을 하나
 * 더하자 두 벌이 어긋나 타입 검사가 터졌다. 한 벌만 두고 내보낸다.
 */
export interface ProfileRow {
  id: string;
  email: string;
  role: string;
  full_name: string | null;
  avatar_url: string | null;
  signup_provider: string;
  terms_agreed_at: string | null;
  privacy_agreed_at: string | null;
  location_agreed_at: string | null;
  marketing_opt_in: boolean;
  created_at: string;
}

/**
 * 사용자가 직접 고칠 수 있는 필드.
 *
 * RLS 의 `profiles_update_own` 정책이 `role`·`email` 을 막고 있고, 이 목록은
 * **화면이 실수로 다른 컬럼을 보내지 않게** 하는 두 번째 방어선이다.
 * 둘 중 하나만 믿지 않는다.
 */
export const USER_EDITABLE_PROFILE_FIELDS = [
  "fullName",
  "avatarUrl",
  "marketingOptIn",
] as const satisfies readonly (keyof Profile)[];

/** DB 행 → 화면 모양. */
export function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    email: row.email,
    role: row.role === "admin" ? "admin" : "user",
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    signupProvider: row.signup_provider,
    termsAgreedAt: row.terms_agreed_at,
    privacyAgreedAt: row.privacy_agreed_at,
    locationAgreedAt: row.location_agreed_at,
    marketingOptIn: row.marketing_opt_in,
    createdAt: row.created_at,
  };
}

/** 화면에 띄울 이름. 이름이 없으면 이메일 앞부분으로 대신한다. */
export function displayNameOf(profile: Profile): string {
  if (profile.fullName?.trim()) return profile.fullName.trim();
  const local = profile.email.split("@")[0];
  return local || "사용자";
}

/**
 * 약관·개인정보 동의를 마쳤는가.
 *
 * `consent.ts` 의 `isConsentComplete` 와 **같은 항목을 본다.** 한쪽에만 항목을
 * 더하면 "화면에서는 받았는데 게이트는 통과 못 하는" 상태가 된다.
 *
 * ⚠️ 구글 로그인으로 **처음** 들어온 사용자는 동의 화면을 거치지 않아 이 값이
 * false 다. 온보딩 게이트가 필요하다는 뜻이고, 그 전까지는 이 함수가 그 사실을
 * 드러내는 유일한 자리다.
 */
export function hasCompletedConsent(profile: Profile): boolean {
  return (
    profile.termsAgreedAt !== null &&
    profile.privacyAgreedAt !== null &&
    profile.locationAgreedAt !== null
  );
}
