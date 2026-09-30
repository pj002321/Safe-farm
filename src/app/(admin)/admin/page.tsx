import type { Metadata } from "next";
import Link from "next/link";
import { AdminPage } from "@/components/admin/AdminPage";
import { AdminPlanned } from "@/components/admin/AdminPlanned";
import { Card } from "@/components/shared/Card";
import { getAdminOverview } from "@/features/admin/overviewStore";
import { requireAdminOrRedirect } from "@/shared/auth/adminSession";
import { BriefingPanel } from "./BriefingPanel";

/**
 * ---------------------------------------------
 * [Feature]: 관리자 개요  →  /admin   (V1-100~102)
 *
 * [Description]
 * - 관리자 셸의 첫 화면. 핵심 지표(V1-100)는 `features/admin/overviewStore.ts` 가
 *   센다. DAU 는 접속 기록 테이블이 없어 빠졌다.
 * - 시스템 상태(V1-101)·오류 로그(V1-102)는 아직 적재 경로가 없어 자리만 둔다.
 *   pg_cron 실행 이력(`cron.job_run_details`)은 PostgREST 에 노출되지 않는
 *   스키마라 조회 함수(RPC)를 따로 만들어야 한다.
 * - 레이아웃이 이미 관리자를 걸렀지만 여기서 한 번 더 부른다. 이 파일만 보고도
 *   무엇이 보호하는지 알 수 있어야 하고, 라우트 그룹이 바뀌어도 살아남는다.
 * - 접근 차단은 세 겹이다: proxy(UX 리다이렉트, `/dashboard` 로) → (admin)/layout.tsx
 *   (`requireAdminOrRedirect`) → 데이터를 만지는 액션(각자 `requireAdmin`).
 *   앞의 둘은 편의고, **보안 경계는 마지막 하나**다.
 * ---------------------------------------------
 */

export const metadata: Metadata = { title: "관리자" };

/** 지표는 매 요청 최신이어야 한다. */
export const dynamic = "force-dynamic";

const PLANNED = [
  { code: "V1-101", nameKo: "시스템 상태 — 배치 · 외부 API 한도 · 평균 응답" },
  { code: "V1-102", nameKo: "오류 로그 — 최근 24시간, 심각도순" },
] as const;

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <Card title={label}>
      <span className="font-mono text-2xl tabular-nums">{value}</span>
    </Card>
  );
}

export default async function AdminHome() {
  await requireAdminOrRedirect();
  const overview = await getAdminOverview();

  const { total, done } = overview.tasksToday;
  const doneRate = total === 0 ? "—" : `${Math.round((done / total) * 100)}%`;
  const maxCrop = overview.topCrops[0]?.count ?? 0;

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
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="가입자" value={overview.members} />
        <Metric label="활성 밭" value={overview.activePlots} />
        <Metric label="재배 중" value={overview.growing} />
        <Metric label="오늘 할 일 완료율" value={doneRate} />
        <Metric label="오늘 할 일" value={`${done} / ${total}`} />
        <Metric label="AI 질문 (최근 7일)" value={overview.asksLast7Days} />
      </div>

      <BriefingPanel />

      <Card title="재배 중인 작물 상위 5">
        {overview.topCrops.length === 0 ? (
          <p className="text-fg-muted">재배 중인 작물이 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {overview.topCrops.map((crop) => (
              <li className="flex items-center gap-3" key={crop.nameKo}>
                <span className="w-20 shrink-0">{crop.nameKo}</span>
                <span className="h-2 flex-1 rounded-full bg-surface-2">
                  <span
                    className="block h-full rounded-full bg-accent"
                    style={{ width: `${(crop.count / maxCrop) * 100}%` }}
                  />
                </span>
                <span className="w-8 text-right font-mono tabular-nums">
                  {crop.count}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <AdminPlanned items={PLANNED} />
    </AdminPage>
  );
}
