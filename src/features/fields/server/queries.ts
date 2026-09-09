import { getServerInsforge } from "@/shared/insforge/server";
import { type Field, type FieldRow, toField } from "../types";

/**
 * ---------------------------------------------
 * [Feature]: 농지 읽기 DAL (서버)
 *
 * [Description]
 * - 서버에서 농지를 읽어야 할 때만 쓴다(예: Route Handler가 예측을 돌리기 전
 *   좌표를 확인). 화면 조회는 api.ts 로 브라우저에서 직접 한다.
 * - `getServerInsforge()` 는 **로그인한 사용자 신분**이라 RLS가 걸린다.
 *   admin 클라이언트가 아니므로 남의 밭은 애초에 안 나온다.
 * - 반환은 항상 DTO(`Field`)다. `FieldRow` 를 그대로 내보내지 않는다.
 * ---------------------------------------------
 */

export async function findFieldById(id: string): Promise<Field | null> {
  const { data, error } = await getServerInsforge()
    .database.from("fields")
    .select()
    .eq("id", id);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as FieldRow[];
  return rows[0] ? toField(rows[0]) : null;
}
