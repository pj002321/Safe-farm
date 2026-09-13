/**
 * ---------------------------------------------
 * [Feature]: Firebase Admin SDK 싱글턴 (서버 전용)
 *
 * [Description]
 * - ⛔ **절대 클라이언트 컴포넌트에서 import 하지 말 것.** 이 모듈은 서비스 계정
 *   개인키를 들고 있고, Admin SDK 는 Firestore 보안 규칙을 **우회**한다. 번들에
 *   섞이는 순간 프로젝트 전체가 브라우저에 넘어간다.
 *   (`server-only` 패키지가 이 프로젝트에 설치돼 있지 않아 import 로 막지 못한다.
 *   대신 아래 런타임 가드로 잡는다. 패키지가 추가되면 `import "server-only";` 를
 *   첫 줄에 넣고 가드를 지워도 된다.)
 - 자격 증명은 **저장소 안의 키 파일 하나**로 읽는다: `secrets/firebase-adminsdk.json`.
 *   환경변수에 JSON 을 통째로 넣는 방식을 쓰지 않는 이유:
 *   · 한 줄짜리 JSON 은 따옴표·개행이 깨지기 쉽고, 깨지면 `error:0909006C` 같은
 *     OpenSSL 오류만 나와 원인이 드러나지 않는다.
 *   · 키를 바꿀 때 파일만 갈아끼우면 되고, 편집기에서 바로 열어 확인할 수 있다.
 *   `secrets/` 는 `.gitignore` 가 디렉터리째 막으므로 커밋될 수 없다.
 * - 파일이 없으면 **Application Default Credentials** 로 넘어간다. 구글 인프라
 *   (Cloud Run · App Hosting · Functions)에서는 키 파일 없이 런타임이 신원을
 *   제공하기 때문이다. 배포에 키 파일을 올릴 필요가 없고, 올려서도 안 된다.
 * - 설정이 없거나 깨졌을 때 조용히 넘기지 않는다. "권한 없음"과 "설정 누락"은
 *   완전히 다른 문제이고, 후자는 사람이 5분이면 고치는데 전자로 오인하면
 *   보안 규칙을 엉뚱하게 헐겁게 만든다. 그래서 무엇을 어떻게 넣어야 하는지까지
 *   적어서 던진다.
 *
 * [Usage]
 * ```ts
 * import { getAdminAuth, getAdminDb } from "@/shared/firebase/admin";
 *
 * const decoded = await getAdminAuth().verifySessionCookie(cookie, true);
 * await getAdminDb().doc(`profiles/${decoded.uid}`).set({ ... }, { merge: true });
 * ```
 * ---------------------------------------------
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type App,
  applicationDefault,
  cert,
  getApp,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { type Auth, getAuth } from "firebase-admin/auth";
import { type Firestore, getFirestore } from "firebase-admin/firestore";

/** Admin App 을 다른 이름으로 둔다. 클라이언트 SDK 의 기본 app 과 섞이지 않게. */
const ADMIN_APP_NAME = "safe-farm-admin";

/**
 * Firestore 데이터베이스 ID.
 *
 * ⚠️ 모든 SDK 는 기본값으로 **`(default)`** (괄호 포함)를 쓴다. 그런데 콘솔에서
 * 데이터베이스를 만들 때 이름을 직접 정하면 `default` 처럼 **괄호 없는 이름**이 되고,
 * 그러면 SDK 가 찾지 못해 모든 호출이 `5 NOT_FOUND` 로 죽는다. 오류 메시지에
 * "어느 데이터베이스를 찾았는지"가 안 나와서 원인을 짚기가 매우 어렵다.
 * 이 프로젝트(safe-farm-ai)는 실제로 `default` 다 — `.env` 에 그렇게 적혀 있다.
 */
const FIRESTORE_DATABASE_ID =
  process.env.FIREBASE_FIRESTORE_DATABASE_ID?.trim() || "(default)";

const SETUP_HINT =
  "Firebase Console → 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성 으로 받은 " +
  "JSON 파일을 secrets/firebase-adminsdk.json 으로 저장하세요. " +
  "(구글 인프라에 배포된 환경이라면 이 파일 없이 기본 자격 증명이 쓰입니다.)";

/** 서비스 계정 JSON 중 우리가 실제로 쓰는 필드. */
interface ServiceAccountJson {
  project_id?: string;
  client_email?: string;
  private_key?: string;
}

/** 저장소 안의 키 파일 위치. `.gitignore` 의 `secrets/` 가 통째로 막는다. */
const KEY_PATH = "secrets/firebase-adminsdk.json";

/** 프로젝트 루트 기준 절대 경로. 서버 프로세스의 cwd 는 항상 루트다. */
function keyFile(): string {
  return join(process.cwd(), KEY_PATH);
}

/**
 * 키 파일을 읽어 파싱한다. 파일이 없으면 null — 부르는 쪽이 ADC 로 넘어간다.
 *
 * `private_key` 의 `\n` 복원은 **파일에서 읽을 때도 필요하다.** JSON 문자열
 * 리터럴 안의 개행은 `\n` 두 글자로 저장돼 있고, `JSON.parse` 가 이미 실제
 * 개행으로 바꿔 주지만, 사람이 편집기에서 한 줄로 붙여넣다 이스케이프가
 * 이중으로 들어간 파일을 종종 만든다. 그때 PEM 파싱이 `error:0909006C` 로
 * 깨지는데 원인이 전혀 드러나지 않으므로 여기서 한 번 더 되돌린다.
 */
function readServiceAccount(): Required<ServiceAccountJson> | null {
  const from = keyFile();
  if (!existsSync(from)) return null;

  const raw = readFileSync(from, "utf8");

  let parsed: ServiceAccountJson;
  try {
    parsed = JSON.parse(raw) as ServiceAccountJson;
  } catch (cause) {
    throw new Error(
      `서비스 계정(${from})이 올바른 JSON 이 아닙니다. 따옴표가 잘리지 않았는지 확인하세요. ${SETUP_HINT}`,
      { cause },
    );
  }

  const missing = (
    ["project_id", "client_email", "private_key"] as const
  ).filter((key) => !parsed[key]);
  if (missing.length > 0) {
    throw new Error(
      `서비스 계정(${from}) JSON 에 ${missing.join(", ")} 가 없습니다. ` +
        `서비스 계정 키 파일 전체를 넣었는지 확인하세요. ${SETUP_HINT}`,
    );
  }

  return {
    project_id: parsed.project_id as string,
    client_email: parsed.client_email as string,
    private_key: (parsed.private_key as string).replace(/\\n/g, "\n"),
  };
}

/** Admin App 싱글턴. 서버리스 인스턴스가 재사용될 때 재초기화를 피한다. */
export function getAdminApp(): App {
  if (typeof window !== "undefined") {
    throw new Error(
      "admin.ts 가 브라우저 번들에 들어왔습니다. 서버 전용 모듈이니 import 경로를 확인하세요.",
    );
  }

  const existing = getApps().find((app) => app.name === ADMIN_APP_NAME);
  if (existing) {
    return getApp(ADMIN_APP_NAME);
  }

  const account = readServiceAccount();

  if (account) {
    return initializeApp(
      {
        credential: cert({
          projectId: account.project_id,
          clientEmail: account.client_email,
          privateKey: account.private_key,
        }),
        projectId: account.project_id,
      },
      ADMIN_APP_NAME,
    );
  }

  // 키 파일이 없다 — 구글 인프라 위라면 런타임이 신원을 제공한다.
  // 로컬이라면 여기서 던지는데, 그 오류 메시지가 사람이 볼 유일한 단서이므로
  // "무엇을 어디에 두라"까지 적어서 감싼다. ADC 원본 오류는 cause 로 남긴다.
  try {
    return initializeApp({ credential: applicationDefault() }, ADMIN_APP_NAME);
  } catch (cause) {
    throw new Error(`서비스 계정 키가 없습니다. ${SETUP_HINT}`, { cause });
  }
}

/** 세션 쿠키 발급·검증과 custom claims(역할) 설정에 쓴다. */
export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

/** `profiles/{uid}` 등 서버가 직접 쓰는 Firestore. 보안 규칙을 우회하므로 주의. */
export function getAdminDb(): Firestore {
  return getFirestore(getAdminApp(), FIRESTORE_DATABASE_ID);
}
