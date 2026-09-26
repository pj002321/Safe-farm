import type { Metadata } from "next";
import { AdminPage } from "@/components/admin/AdminPage";
import { AdminPlanned } from "@/components/admin/AdminPlanned";
import { requireAdminOrRedirect } from "@/shared/auth/session";

/**
 * ---------------------------------------------
 * [Feature]: 배치 관리  →  /admin/batches   (V1-103~107)
 *
 * [Description]
 * - 아직 자리만 있다. **화면보다 적재가 먼저다** — 실행 이력을 남기는 테이블이 없어,
 *   지금 `/api/cron/[job]` 은 성공·실패를 아무데도 쓰지 않는다. V1-103 이 보여줄
 *   데이터 자체가 없다.
 * - 재실행(V1-104)은 버튼이 생기는 순간 Server Action 이고, 그 파일 첫 줄이
 *   `requireAdmin()` 이어야 한다. 레이아웃 검사는 액션에 미치지 않는다.
 * ---------------------------------------------
 */

export const metadata: Metadata = { title: "배치 관리" };

const PLANNED = [
  { code: "V1-103", nameKo: "실행 이력 조회" },
  { code: "V1-104", nameKo: "수동 재실행 (기간 지정)" },
  { code: "V1-105", nameKo: "데이터 결측 현황" },
  { code: "V1-106", nameKo: "API 호출량 추이" },
  { code: "V1-107", nameKo: "위성 처리 현황" },
] as const;

export default async function AdminBatches() {
  await requireAdminOrRedirect();

  return (
    <AdminPage
      descriptionKo="무엇이 돌았고 무엇이 비었는지를 보는 자리입니다."
      titleKo="배치 관리"
    >
      <AdminPlanned items={PLANNED} />
    </AdminPage>
  );
}
