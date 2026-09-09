import { createClient } from "@insforge/sdk";
import { env } from "@/shared/config/env";

/**
 * ---------------------------------------------
 * [Feature]: InsForge 브라우저 클라이언트 (anon)
 *
 * [Description]
 * - **이 앱의 데이터 조회 기본 경로.** 브라우저가 InsForge를 직접 친다.
 * - 리전 전략 A안: InsForge는 ap-southeast, Vercel SSR 함수는 iad1(고정 불가)이라
 *   SSR에서 DB를 치면 버지니아↔싱가포르 왕복이 쿼리마다 붙는다.
 *   따라서 조회는 **클라이언트 컴포넌트에서** 이 클라이언트로 한다.
 * - 권한은 anon 롤 + RLS로 걸린다. RLS가 유일한 방어선이므로
 *   테이블을 만들 때마다 정책을 반드시 같이 만들 것.
 *
 * [Usage]
 * ```tsx
 * "use client";
 * import { insforge } from "@/shared/insforge/client";
 * const { data, error } = await insforge.database.from("fields").select();
 * ```
 * ---------------------------------------------
 */
export const insforge = createClient({
  baseUrl: env.NEXT_PUBLIC_INSFORGE_URL,
  anonKey: env.NEXT_PUBLIC_INSFORGE_ANON_KEY,
});
