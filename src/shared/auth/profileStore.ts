import "server-only";

import { getSupabaseServer } from "@/shared/supabase/server";
import { PROFILES_TABLE, type Profile, toProfile } from "./profile";

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

/** DB 가 돌려주는 행 모양. profile.ts 의 toProfile 이 받는 것과 같다. */
interface ProfileRow {
  id: string;
  email: string;
  role: string;
  full_name: string | null;
  avatar_url: string | null;
  signup_provider: string;
  terms_agreed_at: string | null;
  privacy_agreed_at: string | null;
  marketing_opt_in: boolean;
  created_at: string;
}

/** 지금 로그인한 사용자의 프로필. 로그인 안 했으면 null. */
export async function getCurrentProfile(): Promise<Profile | null> {
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
}

/** 동의 기록. 가입 직후 한 번 부른다(트리거가 만든 행을 채운다). */
export async function recordConsent(input: {
  termsAgreed: boolean;
  privacyAgreed: boolean;
  marketingOptIn: boolean;
  fullName?: string;
}): Promise<void> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("UNAUTHENTICATED");

  const now = new Date().toISOString();
  const { error } = await supabase
    .from(PROFILES_TABLE)
    .update({
      // DB 트리거가 **이미 찍힌 값은 덮어쓰지 않는다.** 매번 now() 를 보내도
      // 최초 동의 시각이 유지된다(스키마의 keep_consent_timestamps).
      terms_agreed_at: input.termsAgreed ? now : null,
      privacy_agreed_at: input.privacyAgreed ? now : null,
      marketing_opt_in: input.marketingOptIn,
      ...(input.fullName?.trim() ? { full_name: input.fullName.trim() } : {}),
    })
    .eq("id", user.id);

  if (error) throw error;
}
