import type { Metadata } from "next";
import { AdminPage } from "@/components/admin/AdminPage";
import { AdminPlanned } from "@/components/admin/AdminPlanned";
import { requireAdminOrRedirect } from "@/shared/auth/session";

/**
 * ---------------------------------------------
 * [Feature]: 작물 마스터  →  /admin/crops   (V1-108~110)
 *
 * [Description]
 * - 아직 자리만 있다. 다만 넷 중 **데이터가 이미 있는 유일한 화면**이다 —
 *   `crops` · `crop_variants` · `crop_stages` 가 시딩돼 있어 조회만 붙이면 표가 선다.
 *   자리가 생긴 뒤 첫 번째로 채울 화면이다.
 * - ⚠️ 이 테이블들은 `safefarm-crop-data` 의 CSV 로 시딩된다. 여기서 값을 고치는
 *   화면(V1-108·109)을 만들면 **다음 시딩이 덮어쓴다.** 수정 기능은 어느 쪽이
 *   정본인지 먼저 정하고 나서다 — 루트 CLAUDE.md "폴더를 가로지르는 데이터 계약".
 * ---------------------------------------------
 */

export const metadata: Metadata = { title: "작물 마스터" };

const PLANNED = [
  { code: "V1-108", nameKo: "작물 등록·수정" },
  { code: "V1-109", nameKo: "GDD 임계값 관리 (출처 기록)" },
  { code: "V1-110", nameKo: "작업 규칙 관리" },
] as const;

export default async function AdminCrops() {
  await requireAdminOrRedirect();

  return (
    <AdminPage
      descriptionKo="작물별 기준온도 · 생육 단계 · 작업 규칙과 그 출처를 관리하는 자리입니다."
      titleKo="작물 마스터"
    >
      <AdminPlanned items={PLANNED} />
    </AdminPage>
  );
}
