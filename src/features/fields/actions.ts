"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/shared/auth/session";
import { createFieldSchema } from "./domain/validate";
import { deleteFieldOwnedBy, insertField } from "./server/mutations";

/**
 * ---------------------------------------------
 * [Feature]: 농지 Server Actions
 *
 * [Description]
 * - **이 파일의 export 하나하나가 공개 POST 엔드포인트다.** UI에 폼을 안 그려도
 *   외부에서 직접 호출된다. 그래서 헬퍼·타입·상수를 여기서 export하지 않는다.
 * - 각 액션의 순서는 항상 같다: 세션 확인 → 입력 검증 → DAL 위임 → 재검증.
 * - 로직은 `server/` 로 위임하고 여기는 얇게 유지한다.
 *
 * [반환값 주의]
 * 반환값은 클라이언트로 직렬화된다. 비밀이나 내부 행(Row)을 그대로 넣지 말 것.
 * ---------------------------------------------
 */

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function createFieldAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();

  const parsed = createFieldSchema.safeParse({
    name: formData.get("name"),
    areaM2: Number(formData.get("areaM2")),
    lat: Number(formData.get("lat")),
    lng: Number(formData.get("lng")),
  });

  if (!parsed.success) {
    // 내부 구현이 드러나지 않게 첫 메시지만 돌려준다.
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const field = await insertField(user.id, parsed.data);
  revalidatePath("/fields");
  return { ok: true, data: { id: field.id } };
}

export async function deleteFieldAction(
  fieldId: string,
): Promise<ActionResult<null>> {
  const user = await requireUser();
  if (!fieldId) return { ok: false, error: "잘못된 요청입니다." };

  // 소유권은 DAL이 owner_id 조건으로 건다. id만 믿지 않는다.
  await deleteFieldOwnedBy(user.id, fieldId);
  revalidatePath("/fields");
  return { ok: true, data: null };
}
