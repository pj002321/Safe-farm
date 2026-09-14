#!/usr/bin/env node

/**
 * 역할 부여·회수.
 *
 *   npm run role -- grant  someone@example.com
 *   npm run role -- revoke someone@example.com
 *   npm run role -- list
 *
 * 왜 화면이 아니라 스크립트인가:
 *   권한을 올리는 기능이 웹에 있으면, 그 화면의 접근 제어가 한 번 헐거워지는
 *   순간 권한 상승 경로가 된다. 사람 손을 한 번 거치게 둔다.
 *
 * ⚠️ **app_metadata 를 바꿔도 이미 발급된 토큰은 그대로다.**
 *   그래서 회수할 때는 세션까지 지운다. 안 지우면 방금 관리자에서 내린 사람이
 *   토큰 수명이 끝날 때까지 관리자로 남는다. 이 파일에서 가장 중요한 줄이다.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// .env 를 직접 읽는다(dotenv 의존성을 늘리지 않는다).
for (const line of readFileSync(
  new URL("../.env", import.meta.url),
  "utf8",
).split("\n")) {
  const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;

if (!url || !key) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL 과 SUPABASE_SERVICE_ROLE 이 필요합니다.\n" +
      "service role 키는 .env 에 두지 말고 셸에서 한 번만 주세요:\n" +
      "  SUPABASE_SERVICE_ROLE='...' npm run role -- list",
  );
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const [command, email] = process.argv.slice(2);

/** 이메일로 사용자를 찾는다. Admin API 에 이메일 조회가 없어 목록에서 고른다. */
async function findByEmail(target) {
  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (error) throw error;
  const user = data.users.find(
    (u) => u.email?.toLowerCase() === target.toLowerCase(),
  );
  if (!user) throw new Error(`사용자를 찾을 수 없습니다: ${target}`);
  return user;
}

async function setRole(target, role) {
  const user = await findByEmail(target);

  const { error } = await supabase.auth.admin.updateUserById(user.id, {
    // app_metadata 여야 한다. user_metadata 는 사용자가 직접 고칠 수 있다.
    app_metadata: { ...user.app_metadata, role },
  });
  if (error) throw error;

  // 표시용 사본도 맞춰 둔다(관리자 목록 화면이 토큰을 안 열어보고도 보게).
  await supabase.from("profiles").update({ role }).eq("id", user.id);

  if (role === "user") {
    // ★ 회수할 때는 세션을 끊는다. 이 줄이 없으면 토큰 수명만큼 관리자로 남는다.
    const { error: signOutError } = await supabase.auth.admin.signOut(
      user.id,
      "global",
    );
    if (signOutError) {
      console.warn(
        "⚠️ 세션 종료 실패 — 토큰이 만료될 때까지 관리자 권한이 남습니다:",
        signOutError.message,
      );
    } else {
      console.log("  기존 세션을 모두 종료했습니다.");
    }
  }

  console.log(`✓ ${target} → ${role}`);
  console.log("  다음 로그인부터 새 역할이 토큰에 실립니다.");
}

try {
  if (command === "grant") await setRole(email, "admin");
  else if (command === "revoke") await setRole(email, "user");
  else if (command === "list") {
    const { data, error } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (error) throw error;
    for (const u of data.users) {
      console.log(
        `  ${u.app_metadata?.role === "admin" ? "[관리자]" : "[사용자]"} ${u.email}`,
      );
    }
  } else {
    console.error("사용법: npm run role -- (grant|revoke) <이메일> | list");
    process.exit(1);
  }
} catch (error) {
  console.error("실패:", error.message);
  process.exit(1);
}
