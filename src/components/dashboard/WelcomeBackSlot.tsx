import { aiService } from "@/shared/aiService/client";
import { WelcomeBackCard } from "./WelcomeBackCard";

/**
 * ---------------------------------------------
 * [Feature]: 오랜만에 온 사용자 인사  (대시보드 상단)
 *
 * [Description]
 * - 7일 넘게 아무것도 안 한 사용자에게, 그동안 밭에 쌓인 걱정거리(특보·밀린 할 일)를
 *   친절한 말투로 알린다. 무엇을 말할지는 기록이 정하고 LLM 은 말투만 맡는다 —
 *   근거 없는 문장·농약 분량 문장은 ai-service 가 버린다(`service/welcome_back.py`).
 * - 관리자 "위험 회원 리포트"와 같은 기준(마지막 활동 7일)이다.
 * - 실패하면 아무것도 그리지 않는다. 인사가 없는 것은 오류가 아니고, 홈을 막을 이유도 없다.
 * ---------------------------------------------
 */
export async function WelcomeBackSlot({ userId }: { userId: string }) {
  const result = await aiService.welcomeBack(userId);
  if (!result.ok) {
    console.error("[dashboard] 복귀 인사 조회 실패", result.reason, result.detail);
    return null;
  }
  if (!result.data.show) return null;
  return (
    <WelcomeBackCard
      dismissKey={result.data.since}
      greeting={result.data.greeting}
      items={result.data.items.map((i) => i.text)}
    />
  );
}
