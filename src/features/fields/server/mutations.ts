import { getServerInsforge } from "@/shared/insforge/server";
import type { CreateFieldInput } from "../domain/validate";
import { type Field, type FieldRow, toField } from "../types";

/**
 * ---------------------------------------------
 * [Feature]: 농지 쓰기 DAL (서버)
 *
 * [Description]
 * - 인가와 소유권 검사가 여기 산다. `actions.ts` 는 이 함수를 부르기만 한다.
 * - **`ownerId` 는 인자로 받지 않고 호출자가 세션에서 얻어 넘긴다.**
 *   클라이언트가 보낸 ownerId 를 믿으면 남의 이름으로 밭을 만들 수 있다.
 * - 삭제는 `id` 만으로 하지 않는다. `owner_id` 를 함께 걸어야 IDOR가 막힌다.
 *   zod는 "모양"만 보지 "내 것인지"는 못 본다.
 * ---------------------------------------------
 */

export async function insertField(
  ownerId: string,
  input: CreateFieldInput,
): Promise<Field> {
  const { data, error } = await getServerInsforge()
    .database.from("fields")
    .insert({
      owner_id: ownerId,
      name: input.name,
      area_m2: input.areaM2,
      latitude: input.lat,
      longitude: input.lng,
    })
    .select();
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as FieldRow[];
  if (!rows[0]) throw new Error("생성된 농지를 읽지 못했습니다.");
  return toField(rows[0]);
}

export async function deleteFieldOwnedBy(ownerId: string, fieldId: string) {
  const { error } = await getServerInsforge()
    .database.from("fields")
    .delete()
    .eq("id", fieldId)
    .eq("owner_id", ownerId); // ← 이 줄이 IDOR 방어선
  if (error) throw new Error(error.message);
}
