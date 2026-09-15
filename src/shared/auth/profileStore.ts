import "server-only";

import { cache } from "react";
import { getSupabaseServer } from "@/shared/supabase/server";
import {
  PROFILES_TABLE,
  type Profile,
  type ProfileRow,
  toProfile,
} from "./profile";

/**
 * ---------------------------------------------
 * [Feature]: 프로필 읽기·쓰기 (서버 전용)
 *
 * [Description]
 * - `profile.ts` 는 타입과 순수 변환만 갖는다. DB 를 만지는 것은 여기다.
 *   나눠 둔 덕에 순수 변환은 테스트가 닿고, 이 파일은 `server-only` 로
 *   클라이언트 번들에 섞이면 **빌드가 깨진다.**
 * - **행 생성은 DB 트리거가 한다**(`on_auth_user_created`). 여기에는 읽기와
 *   사용자 편집만 있다 — 앱에서 upsert 하면 OAuth 콜백처럼 우리 코드를 거치지
 *   않는 경로에서 프로필이 비는 일이 생긴다.
 * ---------------------------------------------
 */

/**
 * 지금 로그인한 사용자의 프로필. 로그인 안 했으면 null.
 *
 * `cache()` 로 감싼 이유: 온보딩 게이트(레이아웃)와 화면(페이지)이 같은 요청에서
 * 각각 부른다. 감싸지 않으면 한 번 그릴 때마다 DB 를 두 번 친다.
 * React 의 요청 단위 캐시라 요청이 끝나면 사라진다 — 사용자 간에 섞이지 않는다.
 */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await getSupabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // RLS 가 자기 행만 보이게 하지만 where 를 명시한다 — 정책이 한 번 헐거워졌을 때
  // 쿼리가 조용히 남의 행을 집지 않게.
  const { data, error } = await supabase
    .from(PROFILES_TABLE)
    .select("*")
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

  if (error) throw error;
  if (!data) return null;
  return toProfile(data);
});

/** 서버용 Supabase 클라이언트 타입. 호출자가 만든 것을 그대로 받기 위해 필요하다. */
type ServerClient = Awaited<ReturnType<typeof getSupabaseServer>>;

/**
 * 동의 기록.
 *
 * **클라이언트와 사용자 id 를 호출자가 넘긴다.** OAuth 콜백은 방금
 * `exchangeCodeForSession` 을 끝낸 클라이언트를 그대로 넘기는데, 그 객체는 새
 * 세션을 메모리에 들고 있다. 여기서 `getSupabaseServer()` 를 새로 만들어 쿠키
 * 저장소를 다시 읽게 하면, 같은 요청 안에서 방금 심은 쿠키가 읽히는지에 기대게
 * 된다 — 기대지 않는 편이 확실하다.
 *
 * 이메일 가입은 이 함수를 타지 않는다. `handle_new_user` 트리거가
 * `raw_user_meta_data.consent` 를 읽어 프로필 행을 만들 때 같이 찍는다.
 */
export async function recordConsentForUser(
  supabase: ServerClient,
  userId: string,
  input: {
    termsAgreed: boolean;
    privacyAgreed: boolean;
    locationAgreed: boolean;
    marketingOptIn: boolean;
    fullName?: string;
  },
): Promise<void> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(PROFILES_TABLE)
    .update({
      // DB 트리거가 **이미 찍힌 값은 덮어쓰지 않는다.** 매번 now() 를 보내도
      // 최초 동의 시각이 유지된다(스키마의 keep_consent_timestamps).
      terms_agreed_at: input.termsAgreed ? now : null,
      privacy_agreed_at: input.privacyAgreed ? now : null,
      location_agreed_at: input.locationAgreed ? now : null,
      marketing_opt_in: input.marketingOptIn,
      ...(input.fullName?.trim() ? { full_name: input.fullName.trim() } : {}),
    })
    .eq("id", userId)
    // 갱신된 행을 돌려받아 **정말 써졌는지** 확인한다. 조건에 맞는 행이 없어도
    // update 는 오류가 아니라 0건으로 조용히 끝나기 때문이다.
    .select("id");

  if (error) throw error;

  // 행이 없다(트리거가 못 돌았거나 RLS 가 가렸다). 성공으로 넘기면 온보딩
  // 게이트가 "동의했는데 또 묻는" 무한 루프에 빠진다. 여기서 끊어야 원인이 보인다.
  if (!data || data.length === 0) throw new Error("PROFILE_NOT_FOUND");
}

/**
 * 지금 로그인한 사용자의 동의를 기록한다.
 *
 * 온보딩 게이트(동의를 뒤늦게 받는 화면)가 쓴다. OAuth 콜백은 이쪽이 아니라
 * `recordConsentForUser` 를 쓴다 — 거기서는 세션이 막 만들어져서 쿠키를 다시
 * 읽는 것보다 손에 든 클라이언트를 넘기는 편이 확실하다.
 */
export async function recordConsent(input: {
  termsAgreed: boolean;
  privacyAgreed: boolean;
  locationAgreed: boolean;
  marketingOptIn: boolean;
  fullName?: string;
}): Promise<void> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("UNAUTHENTICATED");

  await recordConsentForUser(supabase, user.id, input);
}
