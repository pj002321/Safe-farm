import type { Metadata } from "next";
import { AdminPage } from "@/components/admin/AdminPage";
import { AdminPlanned } from "@/components/admin/AdminPlanned";
import { requireAdminOrRedirect } from "@/shared/auth/session";

/**
 * ---------------------------------------------
 * [Feature]: 품질 관리  →  /admin/quality   (V1-111~116)
 *
 * [Description]
 * - 아직 자리만 있다. 지표(V1-113·114·115)는 골든셋 측정에서 나오는데 **호출마다
 *   임베딩 비용이 든다.** 화면이 매 요청 재는 구조로 만들면 안 되고, 사람이 돌린
 *   결과를 저장해 두고 화면은 읽기만 해야 한다(루트 CLAUDE.md "임베딩이 나가는 작업").
 * - 재색인(V1-112)도 같은 이유로 버튼 한 번에 전체를 돌리는 액션이 되면 안 된다.
 *   만들 때 ai-service 의 `pipeline/` 과 계약부터 정한다.
 * ---------------------------------------------
 */

export const metadata: Metadata = { title: "품질 관리" };

const PLANNED = [
  { code: "V1-111", nameKo: "문서 인덱스 현황" },
  { code: "V1-112", nameKo: "재색인 실행" },
  { code: "V1-113", nameKo: "검색 품질 지표 (Recall@k · MRR)" },
  { code: "V1-114", nameKo: "답변 품질 지표" },
  { code: "V1-115", nameKo: "실험 비교 (3군)" },
  { code: "V1-116", nameKo: "가드레일 작동 로그" },
] as const;

export default async function AdminQuality() {
  await requireAdminOrRedirect();

  return (
    <AdminPage
      descriptionKo="문서 인덱스와 검색·답변 품질을 시점별로 견주는 자리입니다."
      titleKo="품질 관리"
    >
      <AdminPlanned items={PLANNED} />
    </AdminPage>
  );
}
