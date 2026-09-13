import type { UserRecord } from "firebase-admin/auth";
import type { Role } from "@/shared/auth/session";
import { getAdminAuth } from "@/shared/firebase/admin";

/**
 * ---------------------------------------------
 * [Feature]: 관리자용 계정 목록 조회
 *
 * [Description]
 * - 관리자 화면이 쓰는 **읽기 전용** 모듈이다. 권한을 바꾸는 함수는 여기 두지 않는다 —
 *   custom claims 변경은 `scripts/set-role.mjs`(서비스 계정 키 필요)만 할 수 있어야 한다.
 *   앱 안에 변경 함수를 두면 그 자체가 권한 상승 경로의 시작점이 된다.
 * - 권한은 Firestore 프로필이 아니라 **Firebase Auth 의 custom claims** 에서 읽는다.
 *   프로필의 `role` 은 표시용 사본이라 클레임과 어긋나 있을 수 있다(권한을 막
 *   바꾸고 상대가 아직 재로그인하지 않은 구간). 관리자 화면은 **진짜 값**을 봐야 한다.
 * - `listUsers` 는 한 번에 최대 1000명이다. 그 이상이면 페이지네이션이 필요한데,
 *   지금 규모에서 미리 만들면 쓰이지 않는 코드가 된다. 대신 **잘렸다는 사실을
 *   호출부가 알 수 있도록** `truncated` 를 함께 돌려준다 — 조용히 일부만 보여주면
 *   관리자가 "없는 계정"이라고 오판한다.
 *
 * [Usage]
 * ```ts
 * const accounts = await listAccounts();
 * ```
 * ---------------------------------------------
 */

/** 한 번에 가져올 최대 인원. Firebase Admin SDK 의 상한과 같다. */
const PAGE_SIZE = 1000;

export interface AccountSummary {
  id: string;
  email: string | null;
  /** custom claims 기준 — 이것이 실제 권한이다. */
  role: Role;
  /** "google.com" | "password" | ... */
  providers: string[];
  /** 표시용 가입일. 정렬은 원본 시각으로 이미 끝난 뒤다. */
  createdAtKo: string;
}

/** Firebase 의 UTC 문자열을 화면용 날짜로. 시각까지는 필요 없다. */
function toKoreanDate(utc: string): string {
  const date = new Date(utc);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(date);
}

function toSummary(user: UserRecord): AccountSummary {
  // 모르는 값이면 가장 약한 권한으로 떨어뜨린다. 애매할 때 admin 으로 보면
  // 그 자체가 권한 상승이다.
  const role: Role = user.customClaims?.role === "admin" ? "admin" : "user";

  return {
    id: user.uid,
    email: user.email ?? null,
    role,
    providers: user.providerData.map((provider) => provider.providerId),
    createdAtKo: toKoreanDate(user.metadata.creationTime),
  };
}

/**
 * 가입한 계정 목록. 최근 가입 순.
 *
 * 조회 실패를 빈 배열로 바꾸지 않는다 — "아직 아무도 없음"과 "불러오지 못함"은
 * 관리자가 내리는 판단이 정반대라, 같은 화면으로 뭉개면 안 된다.
 */
export async function listAccounts(): Promise<AccountSummary[]> {
  const { users } = await getAdminAuth().listUsers(PAGE_SIZE);

  return users
    .map(toSummary)
    .sort((a, b) => b.createdAtKo.localeCompare(a.createdAtKo));
}
