import type { Metadata } from "next";
import { PlotDeleteDock } from "@/components/plot/PlotDeleteDock";
import { PlotManageList } from "@/components/plot/PlotManageList";
import { ButtonLink } from "@/components/shared/Button";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { listPlotCards } from "@/features/plots/plotStore";
import { requireConsentOrRedirect } from "@/shared/auth/consentGate";
import { removePlot, updatePlot } from "./actions";

/**
 * ---------------------------------------------
 * [Feature]: 텃밭 관리  →  /plots
 *
 * [Description]
 * - 등록한 텃밭을 카드 목록으로 보고, 이름·넓이를 고치고, 지운다.
 * - **하단 탭에 넣지 않는다.** 탭 다섯은 매일 쓰는 이동이고 텃밭 관리는 가끔
 *   들르는 화면이다. 홈의 텃밭 줄과 마이페이지에서 들어온다
 *   (`appTabs.tsx` 주석: 늘려야 하면 "더보기"를 만들고 다섯은 유지한다).
 * - ⚠️ `group/plots` 가 이 래퍼 div 에 있다. 하단 독이 `fixed` 라
 *   `backdrop-filter` 를 가진 조상 안에 들어가면 안 되고, `group-has` 는
 *   조상에서 내려다보므로 목록과 독을 **함께 감싸는** 것이 그룹을 들어야 한다
 *   (등록 마법사가 같은 이유로 폼이 아니라 부모 div 에 그룹을 걸었다).
 * - 목록은 `listPlotCards` 를 쓴다 — 홈의 텃밭 줄과 **같은 함수**다. 두 벌로
 *   두면 한쪽만 고쳐져 같은 밭이 화면마다 다르게 보인다.
 *
 * [남은 것]
 * - 생육 타임라인 · 누적 GDD 게이지 · 다음 단계 예측 · 추천 작업 · 7일 기상 차트
 *   · 지역 NDVI · 관찰 기록 · 수확/실패 처리는 아직 없다. 앞의 셋은
 *   `features/growth/` 의 순수 함수가 이미 있어 파종일만으로 붙일 수 있고,
 *   나머지는 밭별 기상 조회나 새 테이블이 먼저 필요하다.
 * ---------------------------------------------
 */

export const metadata: Metadata = {
  title: "텃밭 관리",
  description: "등록한 텃밭을 확인하고 정보를 고치거나 지웁니다.",
};

export default async function Page({
  searchParams,
}: PageProps<"/plots">): Promise<React.ReactElement> {
  const { profile } = await requireConsentOrRedirect();
  const params = await searchParams;

  const plots = await listPlotCards(profile.id);

  const savedKey = Array.isArray(params.saved) ? params.saved[0] : params.saved;
  const rawError = Array.isArray(params.error) ? params.error[0] : params.error;
  // 쿼리 문자열은 사용자가 고칠 수 있다. 액션이 넣은 문장만 쓰되 길이를 잘라
  // 주소창으로 화면에 긴 글을 밀어 넣지 못하게 한다.
  const error = rawError?.slice(0, 120);

  return (
    <main className="mx-auto max-w-4xl px-6 py-6 sm:py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeading
          description="등록한 텃밭을 확인하고, 이름과 넓이를 고치거나 지울 수 있습니다."
          eyebrow="plots"
          title="텃밭 관리"
        />
        <ButtonLink href="/plots/new" size="sm">
          텃밭 등록
        </ButtonLink>
      </div>

      <div className="group/plots mt-7">
        {error && (
          <p className="mb-4 text-sm text-unsuitable" role="alert">
            {error}
          </p>
        )}
        {savedKey === "1" && (
          <output className="mb-4 block text-good text-sm">
            저장했습니다.
          </output>
        )}
        {savedKey === "deleted" && (
          <output className="mb-4 block text-good text-sm">
            텃밭을 지웠습니다.
          </output>
        )}

        <PlotManageList
          onDelete={removePlot}
          onSave={updatePlot}
          plots={plots}
        />

        {/* 폼 바깥이다 — fixed 기준 블록 함정과 제출 값 오염을 함께 피한다. */}
        <PlotDeleteDock />
      </div>
    </main>
  );
}
