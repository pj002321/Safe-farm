"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/shared/supabase/server";

/**
 * ---------------------------------------------
 * [Feature]: 로그인 / 로그아웃 Server Actions
 *
 * [Description]
 * - 이 파일의 export 하나하나가 공개 POST 엔드포인트다. 액션만 둔다.
 * - 인증 실패 사유를 자세히 알려주지 않는다("계정이 없다" vs "비밀번호 틀림"을
 *   구분해 주면 계정 존재 여부가 새어나간다).
 * ---------------------------------------------
 */

export async function login(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  });

  if (error) redirect("/login?error=1");

  revalidatePath("/", "layout");
  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
