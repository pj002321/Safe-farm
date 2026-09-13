import type { DecodedIdToken } from "firebase-admin/auth";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { Consent } from "@/shared/auth/consent";
import { upsertProfileFromToken } from "@/shared/auth/profile";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_MS,
  sessionCookieOptions,
} from "@/shared/auth/sessionCookie";
import { getAdminAuth } from "@/shared/firebase/admin";

/**
 * ---------------------------------------------
 * [Feature]: 세션 쿠키 발급 · 폐기 (로그인/로그아웃의 서버 측 절반)
 *
 * [Description]
 * - Firebase Auth 는 **비밀번호를 서버에서 검증할 수 없다.** 로그인 자체는
 *   브라우저 SDK 가 하고, 서버는 그 결과인 ID 토큰만 받는다. 그래서 흐름이
 *   이렇게 둘로 갈린다:
 *     ① 브라우저: signIn… → `user.getIdToken()`
 *     ② 이 라우트: `verifyIdToken` → `createSessionCookie` → httpOnly 쿠키
 *     ③ 이후 모든 서버 검사: 그 쿠키만 본다(`shared/auth/session.ts`).
 *   ID 토큰을 쿠키에 그대로 담지 않는 이유는 수명이 1시간이고 폐기할 수단이
 *   없기 때문이다. 세션 쿠키는 `revokeRefreshTokens` 로 즉시 죽일 수 있다.
 * - **`runtime = "nodejs"` 를 명시한다.** firebase-admin 은 Node 의 crypto 에
 *   의존해 Edge 런타임에서 돌지 않는다. 기본값에 기대면 Next 버전이 바뀔 때
 *   조용히 Edge 로 넘어가 배포에서만 깨진다.
 * - 오류 응답에 내부 메시지를 싣지 않는다. "이 이메일은 없습니다" 같은 구분은
 *   계정 존재 여부를 알려주는 정보 노출이다. 원인은 서버 로그에만 남긴다.
 *
 * [Usage]
 * ```ts
 * await fetch("/api/auth/session", {
 *   method: "POST",
 *   headers: { "content-type": "application/json" },
 *   body: JSON.stringify({ idToken, consent, fullName }),
 * });
 * await fetch("/api/auth/session", { method: "DELETE" }); // 로그아웃
 * ```
 * ---------------------------------------------
 */

export const runtime = "nodejs";

/**
 * 로그인 직후로 인정하는 시간(초).
 *
 * Firebase 공식 권고다. ID 토큰은 1시간 살아 있는데, 그 끝물 토큰으로 14일짜리
 * 세션 쿠키를 만들어 주면 토큰이 새어 나갔을 때의 악용 창이 그만큼 넓어진다.
 * "방금 인증했다"는 증거가 있을 때만 장수명 쿠키를 발급한다.
 */
const MAX_AUTH_AGE_SECONDS = 5 * 60;

/** 클라이언트에 돌려주는 일반화된 오류. 내부 사정을 담지 않는다. */
function fail(status: number, message: string): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status });
}

/** 요청 본문에서 쓸 값만 추려낸다. 모르는 필드는 무시한다. */
interface SessionRequestBody {
  idToken?: unknown;
  consent?: Consent;
  fullName?: unknown;
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: SessionRequestBody;
  try {
    body = (await request.json()) as SessionRequestBody;
  } catch {
    return fail(400, "요청 형식이 올바르지 않습니다.");
  }

  const { idToken } = body;
  if (typeof idToken !== "string" || idToken.length === 0) {
    return fail(400, "요청 형식이 올바르지 않습니다.");
  }

  // 설정 누락(서비스 계정 등)은 여기서 던져 500 이 된다. 401 로 뭉개면
  // 환경변수 하나 빠진 것이 "비밀번호가 틀렸다"로 보여 아무도 못 고친다.
  const auth = getAdminAuth();

  let decoded: DecodedIdToken;
  try {
    // checkRevoked: 이미 폐기된 토큰으로 새 세션을 만들 수 없게 한다.
    decoded = await auth.verifyIdToken(idToken, true);
  } catch (error) {
    console.error("[auth/session] ID 토큰 검증 실패", error);
    return fail(401, "인증에 실패했습니다. 다시 로그인해 주세요.");
  }

  const authAge = Date.now() / 1000 - decoded.auth_time;
  if (authAge > MAX_AUTH_AGE_SECONDS) {
    return fail(401, "인증이 만료되었습니다. 다시 로그인해 주세요.");
  }

  let sessionCookie: string;
  try {
    sessionCookie = await auth.createSessionCookie(idToken, {
      expiresIn: SESSION_MAX_AGE_MS,
    });
  } catch (error) {
    console.error("[auth/session] 세션 쿠키 생성 실패", error);
    return fail(500, "세션을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }

  // 프로필 문서는 이 라우트가 직접 쓰지 않는다. 무엇을 어떤 규칙으로 쓸지는
  // profile.ts 한 곳에 모아 둔다(동의 시각을 덮어쓰지 않는 규칙 등).
  try {
    await upsertProfileFromToken(decoded, {
      consent: body.consent,
      fullName: typeof body.fullName === "string" ? body.fullName : undefined,
    });
  } catch (error) {
    // 프로필 저장 실패로 로그인을 막지는 않는다 — 신원 확인은 이미 끝났고,
    // 세션 없이 돌려보내면 사용자가 할 수 있는 일이 아무것도 없다.
    // 다만 조용히 넘기지 않고 로그에는 반드시 남긴다(동의 기록이 걸려 있다).
    console.error("[auth/session] 프로필 동기화 실패", error);
  }

  (await cookies()).set(
    SESSION_COOKIE,
    sessionCookie,
    sessionCookieOptions(process.env.NODE_ENV === "production"),
  );

  return NextResponse.json({ ok: true });
}

/**
 * 로그아웃. 쿠키를 지우고 refresh token 도 폐기한다.
 *
 * 폐기에 실패해도(쿠키가 이미 만료·위조됐어도) **쿠키는 반드시 지운다.**
 * 여기서 401 을 돌려주면 "만료된 쿠키를 들고 있어서 로그아웃도 못 하는"
 * 상태에 사용자가 갇힌다. 지울 수 있는 것은 지우는 쪽이 언제나 맞다.
 */
export async function DELETE(): Promise<NextResponse> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE)?.value;

  if (cookie) {
    try {
      const auth = getAdminAuth();
      const decoded = await auth.verifySessionCookie(cookie);
      await auth.revokeRefreshTokens(decoded.sub);
    } catch (error) {
      console.error("[auth/session] 토큰 폐기 실패 (쿠키는 삭제한다)", error);
    }
  }

  // 발급할 때와 같은 path 여야 실제로 지워진다.
  cookieStore.delete({ name: SESSION_COOKIE, path: "/" });

  return NextResponse.json({ ok: true });
}
