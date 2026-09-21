import type { Metadata } from "next";
import Link from "next/link";
import { AdminPage } from "@/components/admin/AdminPage";
import { AdminPlanned } from "@/components/admin/AdminPlanned";
import { requireAdminOrRedirect } from "@/shared/auth/session";

/**
 * ---------------------------------------------
 * [Feature]: 관리자 개요  →  /admin   (V1-100~102)
 *
 * [Description]
 * - 관리자 셸의 첫 화면. 정의서대로라면 핵심 지표 · 시스템 상태 · 오류 로그가 오는
 *   자리인데 **아직 자리만 있다.** 원래 여기 있던 계정 표는 `/admin/members` 로
 *   옮겼다(정의서 V1-120).
 * - 세 항목 모두 적재가 먼저다 — DAU·작업 완료율은 집계 쿼리가, 배치 성공·실패는
 *   실행 이력 테이블이, 오류 로그는 수집 경로가 아직 없다.
 * - 레이아웃이 이미 관리자를 걸렀지만 여기서 한 번 더 부른다. 이 파일만 보고도
 *   무엇이 보호하는지 알 수 있어야 하고, 라우트 그룹이 바뀌어도 살아남는다.
 * - 접근 차단은 세 겹이다: proxy(UX 리다이렉트, `/dashboard` 로) → (admin)/layout.tsx
 *   (`requireAdminOrRedirect`) → 데이터를 만지는 액션(각자 `requireAdmin`).
 *   앞의 둘은 편의고, **보안 경계는 마지막 하나**다.
 * ---------------------------------------------
 */

export const metadata: Metadata = { title: "관리자" };

const PLANNED = [
  {
    code: "V1-100",
    nameKo: "핵심 지표 요약 — 가입자 · 활성 텃밭 · DAU · 작업 완료율",
  },
  { code: "V1-101", nameKo: "시스템 상태 — 배치 · 외부 API 한도 · 평균 응답" },
  { code: "V1-102", nameKo: "오류 로그 — 최근 24시간, 심각도순" },
] as const;

export default async function AdminHome() {
  await requireAdminOrRedirect();

  return (
    <AdminPage
      descriptionKo={
        <>
          오늘의 상태를 한 눈에 보는 자리입니다. 계정과 권한은{" "}
          <Link className="underline hover:text-accent" href="/admin/members">
            회원 관리
          </Link>
          에 있습니다.
        </>
      }
      titleKo="개요"
    >
      <AdminPlanned items={PLANNED} />
    </AdminPage>
  );
}
