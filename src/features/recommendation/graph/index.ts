import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { END, START, StateGraph } from "@langchain/langgraph";
import {
  type CandidateLoader,
  makeCollectWeatherNode,
  makeExplainNode,
  makeLoadCandidatesNode,
  rankCandidatesNode,
  routeAfterRank,
  routeAfterWeather,
  type WeatherFetcher,
} from "./nodes";
import { RecommendationState } from "./state";

/**
 * ---------------------------------------------
 * [Feature]: 작물 추천 그래프 조립
 *
 * [Description]
 * - 외부 의존을 전부 인자로 받는다. 이 파일은 `process.env`를 모른다.
 *   덕분에 노드 하나하나를 그래프 없이 테스트할 수 있다.
 * - **checkpointer를 여기서 만들지 않는다.** 호스트가 넘긴다. 테스트는
 *   MemorySaver를, 실제 실행은 Postgres saver를 주입할 수 있어야 하기 때문이다.
 * - `buildGraph`(미컴파일)와 `createGraph`(컴파일) 둘 다 export한다.
 *
 * [Usage]
 * ```ts
 * const graph = createGraph({ fetchWeather, loadCandidates, llm, checkpointer });
 * const result = await graph.invoke({ fieldId }, { configurable: { thread_id } });
 * ```
 * ---------------------------------------------
 */
export interface GraphDeps {
  fetchWeather: WeatherFetcher;
  loadCandidates: CandidateLoader;
  llm: BaseChatModel;
}

export function buildGraph(deps: GraphDeps) {
  return new StateGraph(RecommendationState)
    .addNode("collectWeather", makeCollectWeatherNode(deps.fetchWeather))
    .addNode("loadCandidates", makeLoadCandidatesNode(deps.loadCandidates))
    .addNode("rank", rankCandidatesNode)
    .addNode("explain", makeExplainNode(deps.llm))
    .addEdge(START, "collectWeather")
    .addConditionalEdges("collectWeather", routeAfterWeather, {
      loadCandidates: "loadCandidates",
      [END]: END,
    })
    .addEdge("loadCandidates", "rank")
    .addConditionalEdges("rank", routeAfterRank, {
      explain: "explain",
      [END]: END,
    })
    .addEdge("explain", END);
}

export function createGraph(
  deps: GraphDeps & { checkpointer?: BaseCheckpointSaver },
) {
  return buildGraph(deps).compile({ checkpointer: deps.checkpointer });
}

export type { RecommendationStateType } from "./state";
export { RecommendationState } from "./state";
