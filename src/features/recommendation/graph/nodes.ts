import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { END } from "@langchain/langgraph";
import {
  type CropProfile,
  rankCrops,
  type WeatherWindow,
} from "@/features/recommendation/domain/suitability";
import type { RecommendationStateType } from "./state";

/**
 * ---------------------------------------------
 * [Feature]: 추천 그래프의 노드들
 *
 * [Description]
 * - 모든 노드는 `(state) => Partial<state>` 형태의 순수하거나 주입된 함수다.
 *   그래서 그래프를 돌리지 않고 노드 하나만 직접 호출해 테스트할 수 있다.
 * - 외부 의존(기상 API, LLM)은 **팩토리 인자로 주입**한다. 노드 안에서
 *   `new ChatOpenAI()` 를 하면 테스트가 불가능해지고 process.env에 묶인다.
 *
 * [Usage]
 * ```ts
 * const node = makeCollectWeatherNode(fakeFetcher);
 * expect(await node({ fieldId: "f1" })).toEqual({ weather: {...} });
 * ```
 * ---------------------------------------------
 */

/** 농지 id로 기상 요약을 가져오는 함수. 구현은 호스트가 주입한다. */
export type WeatherFetcher = (fieldId: string) => Promise<WeatherWindow>;

/** 평가할 작물 후보를 가져오는 함수. */
export type CandidateLoader = () => Promise<CropProfile[]>;

export function makeCollectWeatherNode(fetchWeather: WeatherFetcher) {
  return async (
    state: RecommendationStateType,
  ): Promise<Partial<RecommendationStateType>> => {
    try {
      return { weather: await fetchWeather(state.fieldId) };
    } catch (cause) {
      // 외부 경계(네트워크)이므로 오류 처리가 정당하다. 증상을 숨기는 게 아니라
      // 사용자에게 보여줄 실패 상태로 변환한다.
      return {
        error: `기상 데이터를 가져오지 못했습니다: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
      };
    }
  };
}

export function makeLoadCandidatesNode(loadCandidates: CandidateLoader) {
  return async (): Promise<Partial<RecommendationStateType>> => ({
    candidates: await loadCandidates(),
  });
}

/**
 * 점수 계산. 도메인 순수 함수를 부르기만 한다 — 로직을 여기 복제하지 말 것.
 * 이 노드에 테스트를 쓸 필요는 없다. 로직은 suitability.test.ts가 이미 덮는다.
 */
export async function rankCandidatesNode(
  state: RecommendationStateType,
): Promise<Partial<RecommendationStateType>> {
  if (!state.weather)
    return { error: "기상 데이터가 없어 점수를 낼 수 없습니다." };
  return { ranked: rankCrops(state.candidates, state.weather) };
}

export function makeExplainNode(llm: BaseChatModel) {
  return async (
    state: RecommendationStateType,
  ): Promise<Partial<RecommendationStateType>> => {
    const top = state.ranked.slice(0, 3);
    const response = await llm.invoke([
      {
        role: "system",
        content:
          "너는 농업 컨설턴트다. 주어진 적합도 점수와 위험 요인을 근거로, 농민이 바로 행동할 수 있게 3문장 이내로 설명하라. 점수를 지어내지 마라.",
      },
      {
        role: "user",
        content: JSON.stringify({ weather: state.weather, top }),
      },
    ]);
    return { explanation: String(response.content) };
  };
}

/**
 * 조건부 엣지. 순수 함수라 테스트 가성비가 가장 높다 —
 * 분기표를 테스트로 먼저 쓰면 그게 곧 명세가 된다.
 */
export function routeAfterWeather(
  state: RecommendationStateType,
): "loadCandidates" | typeof END {
  if (state.error) return END;
  if (!state.weather) return END;
  return "loadCandidates";
}

export function routeAfterRank(
  state: RecommendationStateType,
): "explain" | typeof END {
  if (state.error) return END;
  // 추천할 게 없으면 LLM을 부를 이유가 없다. 토큰을 아낀다.
  if (state.ranked.length === 0) return END;
  return "explain";
}
