"use client";

import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import type { Consent } from "@/shared/auth/consent";
import { getFirebaseAuth } from "@/shared/firebase/client";

/**
 * ---------------------------------------------
 * [Feature]: 브라우저 인증 + 세션 쿠키 발급 (로그인·가입·구글 공통 경로)
 *
 * [Description]
 * - Firebase Auth 는 **비밀번호를 서버에서 검증할 수 없다.** 그래서 인증은
 *   브라우저 SDK 가 하고, 서버는 그 결과인 ID 토큰만 받아 세션 쿠키를 굽는다.
 *   로그인·가입·구글 세 경로는 앞부분(무엇으로 인증하는가)만 다르고 뒷부분
 *   (ID 토큰 → `POST /api/auth/session`)은 **완전히 같다.** 각 컴포넌트가 따로
 *   fetch 하면 셋이 조금씩 어긋나고, 한 곳만 고친 실수가 다른 둘에 남는다.
 *   그래서 뒷부분을 `createSession()` 하나로 묶고 화면은 결과만 본다.
 * - 서버 세션 생성이 실패하면 **방금 만든 브라우저 세션도 되돌린다.** 안 그러면
 *   "브라우저는 로그인, 서버는 비로그인" 인 반쪽 상태가 남아서, 화면은 로그인된
 *   것처럼 보이는데 보호 경로는 전부 튕겨내는 설명 불가능한 상황이 된다.
 * - Firebase 의 오류 코드를 **그대로 화면에 뿌리지 않는다.** 영어 원문이기도 하고,
 *   무엇보다 `user-not-found` 와 `wrong-password` 를 구분해 주면 그 자체가
 *   "이 이메일이 가입돼 있는가"를 알려주는 조회 도구가 된다. 같은 문구로 뭉갠다.
 *
 * [Usage]
 * ```tsx
 * const result = await signInWithEmail(email, password);
 * if (!result.ok) return setError(result.message);
 * router.replace(next);
 * router.refresh(); // 이게 없으면 서버 컴포넌트가 옛 비로그인 상태를 계속 보여준다
 * ```
 * ---------------------------------------------
 */

/**
 * 인증 시도의 결과.
 *
 * 예외를 던지지 않고 결과값으로 돌려주는 이유: 부르는 쪽이 전부 폼 제출
 * 핸들러라서, 실패는 화면에 보여 줄 문구일 뿐 프로그램 오류가 아니다.
 * 던지면 호출부마다 try/catch 가 생기고 그중 하나는 반드시 빠진다.
 */
export type SignInResult = { ok: true } | { ok: false; message: string };

/** 세션 라우트에 함께 보낼 값. `idToken` 은 `createSession` 이 붙인다. */
interface SessionPayload {
  consent?: Consent;
  fullName?: string;
}

/**
 * 계정 존재 여부를 흘리지 않는 단일 문구.
 * `user-not-found` · `wrong-password` · `invalid-credential` 이 모두 이것을 쓴다.
 */
const CREDENTIAL_MISMATCH = "이메일 또는 비밀번호가 올바르지 않습니다.";
const NETWORK_FAILED =
  "네트워크에 연결하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.";
const UNEXPECTED = "로그인을 마치지 못했습니다. 잠시 후 다시 시도해 주세요.";

/**
 * Firebase 오류 코드 → 사용자 문구.
 *
 * 여기 없는 코드는 일반 문구로 내보내고 **원본 코드는 콘솔에만** 남긴다.
 * 화면에 원본을 뿌리면 사용자는 못 읽고 공격자만 내부 사정을 읽는다.
 */
const ERROR_MESSAGE: Record<string, string> = {
  "auth/invalid-credential": CREDENTIAL_MISMATCH,
  "auth/invalid-email": CREDENTIAL_MISMATCH,
  "auth/user-not-found": CREDENTIAL_MISMATCH,
  "auth/wrong-password": CREDENTIAL_MISMATCH,
  "auth/user-disabled": "사용이 중지된 계정입니다. 고객센터로 문의해 주세요.",
  // 가입 화면에서도 "이미 가입된 이메일"이라고 말하지 않는다 — 로그인 화면과
  // 같은 이유로, 그 한마디가 가입 여부 조회 도구가 된다.
  "auth/email-already-in-use":
    "이 이메일로는 계정을 만들 수 없습니다. 이미 가입하셨다면 로그인해 주세요.",
  "auth/weak-password": "비밀번호가 너무 짧습니다. 8자 이상으로 정해 주세요.",
  "auth/network-request-failed": NETWORK_FAILED,
  "auth/too-many-requests": "시도가 너무 잦습니다. 잠시 후 다시 시도해 주세요.",
  // 팝업 차단·사용자 취소는 **오류가 아니다.** 붉은 경고가 아니라 다음에 무엇을
  // 하면 되는지를 알려준다.
  "auth/popup-blocked":
    "브라우저가 팝업을 막았습니다. 팝업을 허용한 뒤 다시 시도해 주세요.",
  "auth/popup-closed-by-user": "구글 로그인이 취소되었습니다.",
  "auth/cancelled-popup-request": "구글 로그인이 취소되었습니다.",
  "auth/account-exists-with-different-credential":
    "같은 이메일로 만든 다른 방식의 계정이 있습니다. 이메일과 비밀번호로 로그인해 주세요.",
  "auth/operation-not-allowed":
    "지금은 이 방식으로 로그인할 수 없습니다. 관리자에게 문의해 주세요.",
};

/** `FirebaseError` 를 `instanceof` 없이 좁힌다(SDK 인스턴스가 둘일 때도 안전). */
function errorCodeOf(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }
  const { code } = error as { code: unknown };
  return typeof code === "string" ? code : null;
}

/** 무슨 오류든 사용자에게 보여 줄 한국어 한 줄로 바꾼다. */
function toMessage(error: unknown): string {
  const code = errorCodeOf(error);
  const known = code ? ERROR_MESSAGE[code] : undefined;
  if (known) return known;

  // 모르는 코드는 조용히 삼키지 않는다 — 매핑을 늘려야 한다는 신호다.
  console.error("[auth] 처리하지 못한 인증 오류", code ?? error);
  return UNEXPECTED;
}

/** 세션 라우트가 돌려준 일반화된 오류 문구. 못 읽으면 기본 문구. */
async function readRouteError(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && "error" in body) {
      const { error } = body as { error: unknown };
      if (typeof error === "string" && error.length > 0) return error;
    }
  } catch (error) {
    console.error("[auth] 세션 응답을 해석하지 못했다", error);
  }
  return UNEXPECTED;
}

/**
 * ID 토큰을 서버에 넘겨 세션 쿠키를 받는다. 세 경로가 공유하는 뒷부분.
 *
 * `getIdToken(true)` 로 **강제 갱신**하는 이유: 세션 라우트가 "방금 인증했다"는
 * 증거(`auth_time`)를 5분으로 제한한다. 캐시된 토큰을 보내면 직전에 로그인한
 * 사용자도 만료로 거절당한다.
 */
async function createSession(
  user: User,
  payload: SessionPayload,
): Promise<SignInResult> {
  let message: string;

  try {
    const idToken = await user.getIdToken(true);
    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken, ...payload }),
    });

    if (response.ok) return { ok: true };
    message = await readRouteError(response);
  } catch (error) {
    console.error("[auth] 세션 생성 요청 실패", error);
    message = NETWORK_FAILED;
  }

  // 서버에 세션이 없는데 브라우저만 로그인 상태로 두면, 화면은 로그인된 척하고
  // 보호 경로는 전부 튕기는 반쪽 상태가 된다. 실패는 양쪽 모두에서 실패여야 한다.
  try {
    await signOut(getFirebaseAuth());
  } catch (error) {
    console.error("[auth] 반쪽 세션 정리 실패", error);
  }

  return { ok: false, message };
}

/** 이메일·비밀번호 로그인. */
export async function signInWithEmail(
  email: string,
  password: string,
): Promise<SignInResult> {
  try {
    const credential = await signInWithEmailAndPassword(
      getFirebaseAuth(),
      email,
      password,
    );
    return await createSession(credential.user, {});
  } catch (error) {
    return { ok: false, message: toMessage(error) };
  }
}

/**
 * 이메일 회원가입. 계정을 만들고 곧바로 세션까지 연결한다.
 *
 * Supabase 와 달리 확인 메일을 기다리는 단계가 없다 — 계정이 만들어지는 순간
 * 이미 로그인 상태다. 그래서 "메일을 보냈습니다" 화면도 사라졌다.
 *
 * ⚠️ 세션 생성이 실패하면 브라우저 세션은 되돌리지만 **Firebase 계정은 남는다.**
 * 지우려면 관리자 권한이 필요하고, 사용자가 같은 이메일로 다시 시도하면
 * 로그인으로 이어지므로 남겨 두는 편이 덜 위험하다.
 */
export async function signUpWithEmail(input: {
  email: string;
  password: string;
  fullName?: string;
  consent: Consent;
}): Promise<SignInResult> {
  try {
    const credential = await createUserWithEmailAndPassword(
      getFirebaseAuth(),
      input.email,
      input.password,
    );
    return await createSession(credential.user, {
      consent: input.consent,
      fullName: input.fullName,
    });
  } catch (error) {
    return { ok: false, message: toMessage(error) };
  }
}

/**
 * 구글 간편 로그인/가입.
 *
 * 리다이렉트가 아니라 **팝업**이라 페이지를 떠나지 않는다. 그래서 동의 값이
 * React 상태로 살아남고, 예전처럼 쿠키에 실어 보낼 이유가 없다.
 * `consent` 를 넘기는 쪽이 가입 경로, 넘기지 않는 쪽이 로그인 경로다.
 */
export async function signInWithGoogle(
  consent?: Consent,
): Promise<SignInResult> {
  try {
    const credential = await signInWithPopup(
      getFirebaseAuth(),
      new GoogleAuthProvider(),
    );
    return await createSession(credential.user, consent ? { consent } : {});
  } catch (error) {
    return { ok: false, message: toMessage(error) };
  }
}

/**
 * 로그아웃. 서버 쿠키와 브라우저 세션을 **둘 다** 끊는다.
 *
 * 쿠키 삭제 요청이 실패해도 브라우저 세션은 반드시 끊는다. 여기서 멈추면
 * "로그아웃을 눌렀는데 아무 일도 일어나지 않는" 상태에 사용자가 갇힌다.
 * 실패 사실은 콘솔에 남겨 둔다 — 조용히 지나가면 서버 세션이 남은 줄 모른다.
 */
export async function signOutEverywhere(): Promise<void> {
  try {
    await fetch("/api/auth/session", { method: "DELETE" });
  } catch (error) {
    console.error("[auth] 세션 쿠키 삭제 요청 실패", error);
  }
  await signOut(getFirebaseAuth());
}
