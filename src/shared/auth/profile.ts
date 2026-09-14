import type { DecodedIdToken } from "firebase-admin/auth";
import {
  type DocumentData,
  FieldValue,
  Timestamp,
} from "firebase-admin/firestore";
import type { Consent } from "@/shared/auth/consent";
import { getViewer, type Role } from "@/shared/auth/session";
import { getAdminDb } from "@/shared/firebase/admin";

/**
 * ---------------------------------------------
 * [Feature]: 사용자 프로필 모델 · Firestore 동기화
 *
 * [Description]
 * - `Viewer`(session.ts)와 **역할이 다르다.** 섞지 말 것:
 *   · `Viewer`  = 세션 쿠키 클레임에서 읽는 신원(id·email·role). 네트워크 왕복이
 *                 없어 레이아웃·권한 분기처럼 매 요청 부르는 곳에 쓴다.
 *   · `Profile` = Firestore 문서 하나(이름·아바타·가입 경로·동의 기록). 읽기가
 *                 필요하므로 실제로 그 값을 화면에 쓰는 곳에서만 부른다.
 *   `Viewer` 에 프로필을 합치면 모든 레이아웃이 Firestore 를 한 번씩 더 때린다.
 * - **Firestore `Timestamp` 를 화면까지 끌고 오지 않는다.** `toProfile` 이 경계에서
 *   ISO 문자열로 한 번 바꾼다. Timestamp 객체는 Server Component → Client
 *   Component 직렬화 경계를 넘지 못해(plain object 가 아니다) 화면이 터진다.
 * - Postgres 트리거(`handle_new_user` / `handle_user_metadata_update`)가 하던 일은
 *   `upsertProfileFromToken` 이 대신한다. Cloud Functions 없이 세션 발급 라우트가
 *   Admin SDK 로 직접 쓰므로, 클라이언트가 `signupProvider` 나 동의 시각을
 *   위조할 수 없다(보안 규칙은 firestore.rules 가 별도로 막는다).
 *
 * [Usage]
 * ```ts
 * // 세션 발급 라우트에서
 * const decoded = await getAdminAuth().verifyIdToken(idToken);
 * await upsertProfileFromToken(decoded, { consent, fullName });
 *
 * // 화면에서
 * const profile = await getCurrentProfile();
 * if (profile) console.log(displayNameOf(profile));
 * ```
 * ---------------------------------------------
 */

/** Firestore 컬렉션 이름. 보안 규칙(firestore.rules)의 경로와 같아야 한다. */
export const PROFILES_COLLECTION = "profiles";

export interface Profile {
  id: string;
  email: string;
  /** 표시용 사본. 권한 판단은 `Viewer.role` 로 한다(위 ProfileDocument 주석 참고). */
  role: Role;
  fullName: string | null;
  avatarUrl: string | null;
  /** 'password' | 'google.com' | ... 표시·통계용. 권한 판단에 쓰지 않는다. */
  signupProvider: string;
  /** ISO 8601. 동의 전이거나 로그인 경로로 만들어진 계정이면 null. */
  termsAgreedAt: string | null;
  privacyAgreedAt: string | null;
  marketingOptIn: boolean;
  createdAt: string;
}

/**
 * Firestore `profiles/{uid}` 문서에 **실제로 저장되는 모양.**
 *
 * Firestore 는 스키마가 없어서, 쓰는 쪽이 필드명을 한 글자 틀려도 조용히 새 필드가
 * 생기고 읽는 쪽은 null 을 본다. 컴파일도 통과한다. 그 어긋남을 막는 유일한 계약이
 * 이 타입이므로, 읽기(`toProfile`)와 쓰기(`upsertProfileFromToken`) **양쪽이 이걸
 * 통과해야 한다.** 화면이 쓰는 `Profile` 과는 다르다 — 이쪽은 Timestamp, 저쪽은 ISO 문자열.
 */
export interface ProfileDocument {
  email: string;
  /**
   * 권한의 **사본**이다. 진짜 출처는 Firebase custom claims 이고, 권한 판단은
   * 언제나 `session.ts` 의 `Viewer.role` 로 한다. 여기 두는 이유는 관리자 목록
   * 화면이 사용자마다 토큰을 열어보지 않고도 역할을 보여주기 위해서다.
   * ⚠️ 이 필드로 권한을 판단하지 마라. firestore.rules 가 클라이언트 쓰기를
   * 막고 있지만, 규칙이 한 번 헐거워지면 그 순간 권한 상승 경로가 된다.
   */
  role: Role;
  fullName: string | null;
  avatarUrl: string | null;
  signupProvider: string;
  termsAgreedAt: Timestamp | null;
  privacyAgreedAt: Timestamp | null;
  marketingOptIn: boolean;
  createdAt: Timestamp;
}

/**
 * 쓰기 시점의 모양. 시각 자리에는 실제 Timestamp 대신 `serverTimestamp()` 센티넬이
 * 들어간다(서버 시계로 찍기 위해). 그래서 FieldValue 를 함께 허용한다.
 */
type ProfileWrite = {
  [K in keyof ProfileDocument]?: ProfileDocument[K] | FieldValue;
};

/**
 * 사용자가 직접 고칠 수 있는 필드.
 *
 * ⚠️ **`firestore.rules` 의 `hasOnly([...])` 목록과 반드시 같아야 한다.**
 * 어긋나면 한쪽만 열려서, 화면은 저장했다는데 규칙이 거부하거나(조용한 실패)
 * 반대로 규칙이 잠그려던 필드가 열린다. `profile.test.ts` 가 두 곳을 대조한다.
 */
export const USER_EDITABLE_PROFILE_FIELDS = [
  "fullName",
  "avatarUrl",
  "marketingOptIn",
] as const satisfies readonly (keyof ProfileDocument)[];

/**
 * 저장된 시각을 ISO 문자열로 정규화한다.
 *
 * Admin SDK 는 `Timestamp`, 로컬 에뮬레이터·직렬화를 거친 값은 `Date` 나 ISO
 * 문자열로 오는 경우가 있어 셋을 모두 받는다. 반대로 **모르는 모양은 던진다** —
 * 조용히 null 로 바꾸면 "동의 기록이 없는 계정"과 "읽기가 깨진 계정"을 구분할 수
 * 없게 되고, 동의 기록은 증거로 남아야 하는 값이다.
 */
function toIsoOrNull(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Timestamp) return value.toDate().toISOString();

  // 에뮬레이터·직렬화본은 instanceof 가 통하지 않을 수 있어 오리 타이핑도 본다.
  if (
    typeof value === "object" &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }

  throw new Error(
    `프로필 필드 ${field} 의 시각 형식을 알 수 없습니다: ${typeof value}`,
  );
}

/**
 * Firestore 문서를 화면용 모델로 바꾼다. **순수 함수** — 그래서 테스트할 수 있다.
 *
 * `createdAt` 은 우리가 문서를 만들 때 항상 적으므로, 없으면 데이터가 깨진 것이다.
 * 기본값으로 메우면 결함이 화면 뒤로 숨는다.
 */
export function toProfile(id: string, data: DocumentData): Profile {
  const createdAt = toIsoOrNull(data.createdAt, "createdAt");
  if (!createdAt) {
    throw new Error(`프로필 ${id} 에 createdAt 이 없습니다.`);
  }

  return {
    id,
    email: typeof data.email === "string" ? data.email : "",
    // 모르는 값이면 가장 약한 권한으로 떨어뜨린다. 애매할 때 admin 으로 보면
    // 권한 상승이 되므로, 기본값은 항상 아래쪽이어야 한다.
    role: data.role === "admin" ? "admin" : "user",
    fullName: typeof data.fullName === "string" ? data.fullName : null,
    avatarUrl: typeof data.avatarUrl === "string" ? data.avatarUrl : null,
    signupProvider:
      typeof data.signupProvider === "string" ? data.signupProvider : "unknown",
    termsAgreedAt: toIsoOrNull(data.termsAgreedAt, "termsAgreedAt"),
    privacyAgreedAt: toIsoOrNull(data.privacyAgreedAt, "privacyAgreedAt"),
    marketingOptIn: data.marketingOptIn === true,
    createdAt,
  };
}

/**
 * 화면에 부를 이름. 이름이 없으면 이메일 아이디 부분으로 대신한다.
 *
 * 구글 가입은 이름이 따라오지만 이메일 가입은 이름 칸이 선택이라 비어 있을 수
 * 있다. 그때 "님" 앞이 비면 문장이 깨지므로 여기서 한 번에 정한다.
 */
export function displayNameOf(profile: Profile): string {
  const trimmed = profile.fullName?.trim();
  if (trimmed) return trimmed;

  const localPart = profile.email.split("@")[0];
  return localPart || "농부";
}

/** 필수 약관에 모두 동의한 계정인가. 온보딩 게이트가 필요해지면 이 값을 본다. */
export function hasCompletedConsent(profile: Profile): boolean {
  return profile.termsAgreedAt !== null && profile.privacyAgreedAt !== null;
}

/**
 * ID 토큰을 근거로 `profiles/{uid}` 를 만들거나 갱신한다.
 * Postgres 의 INSERT/UPDATE 트리거 두 개를 합친 자리다.
 *
 * 규칙(SQL 판과 같은 의미):
 * - `signupProvider` 는 **최초 생성 때만** 적는다. 나중 로그인 수단으로 갈아치우면
 *   "어떻게 가입했는가"라는 정보가 영영 사라진다.
 * - 동의 시각은 **한 번 찍히면 덮어쓰지 않는다.** 최초 동의 시점이 기록의 핵심이라
 *   나중 값으로 갈아치우면 언제 동의했는지 알 수 없게 된다(SQL 의 coalesce 와 동일).
 * - 마케팅 수신은 최신 값을 따른다. 수신 거부는 언제든 가능해야 한다.
 * - 시각은 **서버 시계**(`serverTimestamp`)로 찍는다. 클라이언트가 보낸 시각은
 *   사용자가 고칠 수 있어 증거가 되지 못한다.
 *
 * ponytail: get → set(merge) 두 단계라, 같은 uid 의 동시 로그인 두 건이 겹치면
 * 동의 시각이 밀리초 단위로 다시 찍힐 수 있다. 값이 사실상 같아 실해가 없어
 * 트랜잭션을 쓰지 않았다. 동의 시각의 감사 이력이 필요해지면 runTransaction 으로.
 */
export async function upsertProfileFromToken(
  decoded: DecodedIdToken,
  input: { consent?: Consent; fullName?: string } = {},
): Promise<void> {
  const ref = getAdminDb().collection(PROFILES_COLLECTION).doc(decoded.uid);
  const snapshot = await ref.get();
  const existing = snapshot.data();

  // 권한은 토큰의 custom claim 이 유일한 출처다. 여기서는 **읽어서 베끼기만** 한다.
  const role: Role = decoded.role === "admin" ? "admin" : "user";

  const now = FieldValue.serverTimestamp();
  const patch: ProfileWrite = {
    // 이메일 없는 제공자(전화 로그인 등)를 대비한 폴백.
    email: decoded.email ?? existing?.email ?? "",
    // 매 로그인마다 클레임과 맞춘다. 관리자 권한을 회수했는데 사본이 남아
    // 화면에만 "관리자"로 보이는 상태를 막는다.
    role,
  };

  // 이름은 폼 입력 > 토큰의 표시 이름 순. 둘 다 비면 기존 값을 건드리지 않는다
  // (undefined 를 쓰면 Firestore 가 필드를 지운다고 오해할 수 있어 아예 뺀다).
  const fullName = input.fullName?.trim() || decoded.name || null;
  if (fullName !== null || !snapshot.exists) {
    patch.fullName = fullName;
  }

  if (decoded.picture !== undefined || !snapshot.exists) {
    patch.avatarUrl = decoded.picture ?? null;
  }

  if (!snapshot.exists) {
    patch.createdAt = now;
    patch.signupProvider = decoded.firebase.sign_in_provider;
    patch.marketingOptIn = false;
    patch.termsAgreedAt = null;
    patch.privacyAgreedAt = null;
  }

  if (input.consent) {
    if (input.consent.terms && !existing?.termsAgreedAt) {
      patch.termsAgreedAt = now;
    }
    if (input.consent.privacy && !existing?.privacyAgreedAt) {
      patch.privacyAgreedAt = now;
    }
    patch.marketingOptIn = input.consent.marketing;
  }

  await ref.set(patch, { merge: true });
}

/**
 * 현재 로그인한 사용자의 프로필. 로그인하지 않았거나 문서가 없으면 null.
 *
 * 문서가 없는 것은 **정상 상태**다 — 세션 라우트를 거치기 전에 만들어진 계정이나
 * 관리자가 콘솔에서 직접 만든 계정에는 문서가 없다. 반면 읽기 자체의 실패
 * (서비스 계정 설정 누락·권한 오류·네트워크)는 고쳐야 할 결함이라 그대로 던진다.
 * 둘을 같은 null 로 뭉개면 원인이 사라진다.
 */
export async function getCurrentProfile(): Promise<Profile | null> {
  const viewer = await getViewer();
  if (!viewer) return null;

  const snapshot = await getAdminDb()
    .collection(PROFILES_COLLECTION)
    .doc(viewer.id)
    .get();

  const data = snapshot.data();
  return data ? toProfile(snapshot.id, data) : null;
}
