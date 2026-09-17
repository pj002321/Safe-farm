import type { Metadata } from "next";
import { AskPanel, type AskPlotOption } from "@/components/ask/AskPanel";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { listPlotCards } from "@/features/plots/plotStore";
import { aiService } from "@/shared/aiService/client";
import { requireConsentOrRedirect } from "@/shared/auth/consentGate";

/**
 * ---------------------------------------------
 * [Feature]: 질문  →  /ask
 *
 * [Description]
 * - 하단 탭 다섯 개 중 하나. 자연어로 묻고, 우리가 가진 자료에서 근거를 찾아
 *   답한다. 답변 생성은 `ai-service` 가 하고 여기는 화면과 프록시만 맡는다.
 * - **밭 목록을 여기서 만든다.** 브라우저가 보낸 `plotId` 를 그대로 믿으면 남의
 *   밭 id 로 물어 그 밭의 작물·위치를 답변으로 되받을 수 있다. 목록이 `user_id`
 *   로 좁혀진 `listPlotCards` 에서 나오므로 고를 수 있는 것이 내 밭뿐이다.
 * - 추천 질문과 잔여 횟수는 ai-service 에 묻는다. **실패해도 화면은 선다** —
 *   둘 다 없으면 질문을 못 하는 게 아니라 안내가 빠질 뿐이다.
 * - 대화 이력을 아직 안 보여준다. `ask_history` 에 쌓이고는 있지만 후속 질문에
 *   맥락으로 되먹이는 쪽이 먼저다(Sh0win/ToDo6.md #21).
 * ---------------------------------------------
 */

export const metadata: Metadata = {
  title: "질문",
  description: "재배 중 궁금한 것을 묻고 자료에 근거한 답을 받습니다.",
};

/** 밭 하나를 고르는 줄에 찍을 이름. 이름이 없으면 지역으로 대신한다. */
function toOption(plot: {
  id: string;
  nameKo: string | null;
  regionKo: string;
}): AskPlotOption {
  return {
    id: plot.id,
    labelKo: plot.nameKo ?? `${plot.regionKo}의 밭`,
  };
}

export default async function Page(): Promise<React.ReactElement> {
  const { viewer, profile } = await requireConsentOrRedirect();

  const plots = await listPlotCards(profile.id);
  const options = plots.map(toOption);

  // 추천 질문은 첫 밭 기준이다. 사용자가 다른 밭을 고르면 질문 자체는 그 밭으로
  // 가지만 칩 문구는 그대로다 — 칩은 첫 화면의 마중물이라 여기서 멈춘다.
  const [quotaResult, suggestionResult] = await Promise.all([
    aiService.askQuota(viewer.id),
    aiService.askSuggestions(viewer.id, options[0]?.id ?? null),
  ]);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-6 sm:py-8">
      <SectionHeading
        description="재배 중 궁금한 것을 물어보세요. 가지고 있는 자료에서 근거를 찾아 답합니다."
        eyebrow="ask"
        title="질문"
      />

      <AskPanel
        plots={options}
        quota={quotaResult.ok ? quotaResult.data : null}
        suggestionBasisKo={
          suggestionResult.ok ? suggestionResult.data.basis : null
        }
        suggestions={suggestionResult.ok ? suggestionResult.data.questions : []}
      />

      <p className="text-fg-subtle text-xs leading-relaxed">
        농약 희석배수·살포량은 답변하지 않습니다. 등록된 사용 기준은
        농약안전정보시스템에서 확인해 주세요. 답변은 참고용이며 병해충 진단을
        대신하지 않습니다.
      </p>
    </main>
  );
}
