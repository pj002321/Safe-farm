import type { Metadata } from "next";
import { AdminPage } from "@/components/admin/AdminPage";
import { AdminPlanned } from "@/components/admin/AdminPlanned";
import { requireAdminOrRedirect } from "@/shared/auth/session";

/**
 * ---------------------------------------------
 * [Feature]: 예측 정확도  →  /admin/accuracy   (V1-117~119)
 *
 * [Description]
 * - 아직 자리만 있다. 오차를 재려면 **예측값과 실제값이 나란히 저장돼 있어야** 하는데
 *   지금은 예측만 있고 실제 단계 도달일을 받는 입력(V1-119 사용자 보정)이 없다.
 *   셋 중 V1-119 가 먼저다 — 그게 있어야 117·118 이 잴 것이 생긴다.
 * ---------------------------------------------
 */

export const metadata: Metadata = { title: "예측 정확도" };

const PLANNED = [
  { code: "V1-117", nameKo: "모델 비교 (MAE)" },
  { code: "V1-118", nameKo: "단계별 오차 분포" },
  { code: "V1-119", nameKo: "사용자 보정 이력" },
] as const;

export default async function AdminAccuracy() {
  await requireAdminOrRedirect();

  return (
    <AdminPage
      descriptionKo="생육 단계 예측이 실제와 얼마나 어긋났는지를 보는 자리입니다."
      titleKo="예측 정확도"
    >
      <AdminPlanned items={PLANNED} />
    </AdminPage>
  );
}
