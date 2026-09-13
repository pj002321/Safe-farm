#!/usr/bin/env node
/**
 * ---------------------------------------------
 * [Feature]: 사용자 권한(custom claim) 부여·회수 CLI
 *
 * [Description]
 * - 권한의 **유일한 출처**는 Firebase custom claims 이고, claims 는 Admin SDK 로만
 *   설정된다. 즉 서비스 계정 키를 가진 사람만 관리자를 만들 수 있다. 화면에서
 *   관리자를 임명하는 기능을 만들지 않은 이유가 이것이다 — 그런 화면은 그 자체가
 *   권한 상승 경로가 되고, 첫 관리자를 만들 방법도 없다(닭과 달걀).
 * - 앱 번들과 분리된 스크립트다. `src/` 에 두면 빌드에 섞이고, 서버 액션으로 만들면
 *   공개 POST 엔드포인트가 된다.
 * - 변경 후 **기존 세션을 무효화한다**(`revokeRefreshTokens`). 이게 없으면 권한을
 *   회수해도 상대의 세션 쿠키가 만료될 때까지 최대 14일간 관리자로 남는다.
 *   `session.ts` 가 `verifySessionCookie(cookie, true)` 로 폐기를 검사하므로,
 *   폐기하면 다음 요청에서 바로 로그아웃된다.
 * - Firestore 프로필의 `role` 은 **사본**이라 여기서도 함께 갱신한다. 다음 로그인에
 *   어차피 덮어써지지만, 그 사이 관리자 목록 화면이 옛 값을 보여주지 않게 한다.
 *
 * [Usage]
 * ```bash
 * node scripts/set-role.mjs list                     # 사용자와 현재 권한 보기
 * node scripts/set-role.mjs grant you@example.com    # 관리자 부여
 * node scripts/set-role.mjs revoke you@example.com   # 관리자 회수
 * ```
 * ---------------------------------------------
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const DEFAULT_KEY_PATH = "secrets/firebase-adminsdk.json";

/** `.env` / `.env.local` 의 한 줄짜리 값만 읽는다. dotenv 를 의존성에 더하지 않으려고. */
function readEnvFile(name) {
  const path = join(process.cwd(), name);
  if (!existsSync(path)) return {};

  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      }),
  );
}

// .env.local 이 .env 를 덮어쓴다 — Next 의 우선순위와 같게 맞춘다.
const env = {
  ...readEnvFile(".env"),
  ...readEnvFile(".env.local"),
  ...process.env,
};

function loadServiceAccount() {
  // 앱(admin.ts)과 **같은 파일 하나**를 본다. 스크립트만 다른 경로를 보면
  // "CLI 로는 되는데 앱에서는 안 된다" 같은 혼란이 생긴다.
  const absolute = join(process.cwd(), DEFAULT_KEY_PATH);

  if (!existsSync(absolute)) {
    throw new Error(
      `서비스 계정을 찾지 못했습니다: ${absolute}\n` +
        "Firebase Console → 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성 으로 받아\n" +
        `${DEFAULT_KEY_PATH} 에 두세요.`,
    );
  }
  return JSON.parse(readFileSync(absolute, "utf8"));
}

const account = loadServiceAccount();
const app = initializeApp(
  {
    credential: cert({
      projectId: account.project_id,
      clientEmail: account.client_email,
      privateKey: account.private_key.replace(/\\n/g, "\n"),
    }),
    projectId: account.project_id,
  },
  "set-role",
);

const auth = getAuth(app);
const db = getFirestore(app, env.FIREBASE_FIRESTORE_DATABASE_ID || "(default)");

async function list() {
  const { users } = await auth.listUsers(1000);
  if (users.length === 0) {
    console.log("등록된 사용자가 없습니다.");
    return;
  }

  console.log(`사용자 ${users.length}명\n`);
  for (const user of users) {
    const role = user.customClaims?.role === "admin" ? "admin" : "user";
    const providers = user.providerData.map((p) => p.providerId).join(", ");
    console.log(
      `  ${role === "admin" ? "★" : " "} ${(user.email ?? "(이메일 없음)").padEnd(32)} ${role.padEnd(6)} ${providers}`,
    );
  }
}

async function setRole(email, role) {
  const user = await auth.getUserByEmail(email);

  // claims 를 통째로 덮어쓰지 않는다. 나중에 다른 클레임이 생겼을 때 지워버리면
  // 원인 찾기가 매우 어려운 종류의 사고가 된다.
  const claims = { ...(user.customClaims ?? {}) };
  if (role === "admin") {
    claims.role = "admin";
  } else {
    delete claims.role;
  }

  await auth.setCustomUserClaims(user.uid, claims);

  // 기존 세션 무효화. 이게 이 스크립트에서 가장 중요한 한 줄이다.
  await auth.revokeRefreshTokens(user.uid);

  // 표시용 사본도 맞춰 둔다(다음 로그인에 어차피 덮어써진다).
  await db
    .collection("profiles")
    .doc(user.uid)
    .set({ role: role === "admin" ? "admin" : "user" }, { merge: true })
    .catch((error) => {
      // 프로필 문서가 아직 없을 수 있다(로그인 전). 권한 자체는 이미 바뀌었으므로
      // 실패를 보고만 하고 종료 코드는 성공으로 둔다.
      console.warn(`  (프로필 사본 갱신 실패: ${error.message})`);
    });

  console.log(
    `${email} → ${role}. 기존 세션을 폐기했으므로 상대는 다시 로그인해야 합니다.`,
  );
}

const [command, email] = process.argv.slice(2);

try {
  if (command === "list") {
    await list();
  } else if ((command === "grant" || command === "revoke") && email) {
    await setRole(email, command === "grant" ? "admin" : "user");
  } else {
    console.log(
      "사용법:\n" +
        "  node scripts/set-role.mjs list\n" +
        "  node scripts/set-role.mjs grant <email>\n" +
        "  node scripts/set-role.mjs revoke <email>",
    );
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`실패: ${error.message}`);
  process.exitCode = 1;
}
