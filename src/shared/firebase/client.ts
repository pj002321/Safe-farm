/**
 * ---------------------------------------------
 * [Feature]: Firebase 브라우저 SDK 싱글턴
 *
 * [Description]
 * - **브라우저 전용이다. 서버 컴포넌트나 Route Handler 에서 import 하지 말 것.**
 *   여기의 Auth 는 IndexedDB/localStorage 에 세션을 들고 있는 클라이언트 SDK 라
 *   서버에는 보관할 사용자 상태가 없다. 서버 검증은 `admin.ts` 의
 *   `verifySessionCookie()` 로만 한다. (이 파일 자체는 `"use client"` 가 아니다 —
 *   클라이언트 컴포넌트가 import 해서 쓰는 평범한 모듈이다.)
 * - `getApps().length` 가드가 필요한 이유: Next 의 HMR 과 RSC 번들 분리 때문에
 *   모듈이 여러 번 평가된다. 가드가 없으면 `duplicate-app` 으로 죽는다.
 *   `getAuth` 도 같은 이유로 매번 새로 만들지 않는다(SDK 가 app 당 인스턴스를 캐시).
 * - `browserLocalPersistence` 를 **명시**한다. 기본값에 기대면 환경에 따라
 *   세션 스토리지로 떨어져 새로고침 한 번에 로그인이 풀린다. 로그인 유지 여부가
 *   여기서 갈리므로 눈에 보이게 적어 둔다.
 *   `setPersistence` 는 비동기지만 SDK 가 내부 큐로 직렬화하므로, 곧바로 이어지는
 *   `signIn*` 호출보다 먼저 적용된다. 그래서 await 하지 않아도 안전하다.
 *
 * [Usage]
 * ```tsx
 * "use client";
 * import { getFirebaseAuth } from "@/shared/firebase/client";
 *
 * const credential = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
 * const idToken = await credential.user.getIdToken();
 * await fetch("/api/auth/session", { method: "POST", body: JSON.stringify({ idToken }) });
 * ```
 * ---------------------------------------------
 */

import { type FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import { type Auth, browserLocalPersistence, getAuth } from "firebase/auth";
import { publicFirebaseEnv, readFirebaseConfig } from "./config";

/** 브라우저용 Firebase App. 없으면 만들고, 있으면 그대로 돌려준다. */
export function getFirebaseApp(): FirebaseApp {
  return getApps().length > 0
    ? getApp()
    : initializeApp(readFirebaseConfig(publicFirebaseEnv()));
}

/** 브라우저용 Auth. 지속성(로그인 유지)을 명시적으로 건 상태로 돌려준다. */
export function getFirebaseAuth(): Auth {
  const auth = getAuth(getFirebaseApp());
  // 이미 걸려 있어도 재호출이 무해하다(같은 값이면 no-op).
  void auth.setPersistence(browserLocalPersistence);
  return auth;
}
