/**
 * ---------------------------------------------
 * [Feature]: Firebase 웹 설정 읽기 + 검증
 *
 * [Description]
 * - **이 값들은 비밀이 아니다.** Firebase 웹 설정(apiKey 포함)은 브라우저 번들에
 *   그대로 실리도록 설계된 공개 식별자다. apiKey 는 "인증 키"가 아니라 어느
 *   프로젝트로 요청을 보낼지 알려주는 라우팅 값이다. 실제 방어선은 Firebase
 *   Auth 설정 · Firestore 보안 규칙 · App Check 이다. 그래서 git 에 추적되는
 *   `.env` 에 실제 값을 둔다 — 유출된 게 아니니 놀라지 말 것.
 *   진짜 시크릿은 서비스 계정 키 파일(`secrets/firebase-adminsdk.json`) 하나뿐이며
 *   `admin.ts` 가 다룬다. 그 파일은 환경변수를 거치지 않고 경로로 직접 읽는다.
 * - `readFirebaseConfig` 를 순수 함수로 둔 이유: env 를 주입받아야 테스트가 되고,
 *   `src/shared/config/site.ts` 가 이미 같은 컨벤션을 쓴다.
 * - 빈 문자열을 그대로 넘기지 않는다. Firebase SDK 는 잘못된 설정을 받아도
 *   초기화 시점엔 조용하고, 한참 뒤 `auth/invalid-api-key` 같은 엉뚱한 지점에서
 *   죽는다. 어느 변수가 비었는지 이름을 적어 즉시 던지는 편이 싸다.
 * - 모듈 최상위에서 설정을 만들지 않는다(`export const firebaseConfig = ...` 금지).
 *   로드 시점에 던지면 설정이 필요 없는 페이지의 빌드까지 통째로 깨진다.
 *
 * [Usage]
 * ```ts
 * // 브라우저 · 서버 공통 진입점
 * initializeApp(readFirebaseConfig(publicFirebaseEnv()));
 * // 테스트
 * expect(() => readFirebaseConfig({})).toThrow(/NEXT_PUBLIC_FIREBASE_API_KEY/);
 * ```
 * ---------------------------------------------
 */

/** Firebase 웹 SDK `initializeApp` 이 받는 공개 설정. */
export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

/**
 * `readFirebaseConfig` 가 보는 환경변수.
 *
 * 인덱스 시그니처가 필요하다. 선택 속성만 가진 타입은 TS 의 weak type 검사에
 * 걸려 `process.env`(ProcessEnv)를 그대로 넘길 수 없다 — "공통 속성이 없다"고
 * 거절한다. 환경변수는 본래 문자열 맵이므로 이렇게 적는 것이 사실에도 맞다.
 */
export interface FirebaseEnv {
  NEXT_PUBLIC_FIREBASE_API_KEY?: string;
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?: string;
  NEXT_PUBLIC_FIREBASE_PROJECT_ID?: string;
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?: string;
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?: string;
  NEXT_PUBLIC_FIREBASE_APP_ID?: string;
  [key: string]: string | undefined;
}

/** 설정 키 → 환경변수 이름. 오류 메시지에 사람이 고칠 이름을 적기 위해 쓴다. */
const ENV_NAMES: Record<keyof FirebaseConfig, string> = {
  apiKey: "NEXT_PUBLIC_FIREBASE_API_KEY",
  authDomain: "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  projectId: "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  storageBucket: "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  appId: "NEXT_PUBLIC_FIREBASE_APP_ID",
};

/**
 * 브라우저에서도 값이 살아 있는 env 스냅샷.
 *
 * **`process.env` 를 통째로 넘기면 안 되는 이유**: Next 는 클라이언트 번들에서
 * `process.env.NEXT_PUBLIC_XXX` 라는 **문자열을 그대로 찾아 치환**한다. 공식 문서가
 * 명시하듯 `const env = process.env; env.NEXT_PUBLIC_XXX` 나 `process.env[name]`
 * 같은 간접 참조는 치환되지 않는다 — 서버에선 멀쩡하고 브라우저에서만 전부
 * undefined 가 되는, 찾기 고약한 종류의 버그다.
 * 그래서 여섯 개를 여기 한 곳에서 리터럴로 적어 둔다. 늘어나면 여기만 고친다.
 */
export function publicFirebaseEnv(): FirebaseEnv {
  return {
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID:
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
}

/**
 * 환경변수에서 Firebase 공개 설정을 읽는다. 순수 함수.
 *
 * @throws 하나라도 비어 있으면 빠진 변수 **이름을 모두 나열해서** 던진다.
 *         한 개씩 알려주면 고치고 다시 돌리기를 여섯 번 반복하게 된다.
 */
export function readFirebaseConfig(env: FirebaseEnv): FirebaseConfig {
  const keys = Object.keys(ENV_NAMES) as (keyof FirebaseConfig)[];

  const missing = keys
    .filter((key) => !env[ENV_NAMES[key]]?.trim())
    .map((key) => ENV_NAMES[key]);

  if (missing.length > 0) {
    throw new Error(
      `Firebase 설정이 비어 있습니다: ${missing.join(", ")}\n` +
        "이 값들은 비밀이 아니므로 .env 에 실제 값을 넣어도 됩니다. " +
        "Firebase Console → 프로젝트 설정 → 일반 → 내 앱 → SDK 설정 및 구성 에서 복사하세요.",
    );
  }

  const config = {} as FirebaseConfig;
  for (const key of keys) {
    // 위 필터가 빈 값을 모두 걸러냈으므로 여기서는 string 이 보장된다.
    config[key] = (env[ENV_NAMES[key]] as string).trim();
  }
  return config;
}
