import { Annotation } from "@langchain/langgraph";
import type {
  CropProfile,
  SuitabilityResult,
  WeatherWindow,
} from "@/features/recommendation/domain/suitability";

/**
 * ---------------------------------------------
 * [Feature]: 추천 그래프 상태 스키마
 *
 * [Description]
 * - 그래프를 흐르는 값의 정의. 각 노드는 이 중 일부만 반환한다(Partial).
 * - 도메인 타입(`CropProfile`, `SuitabilityResult`)을 그대로 재사용한다.
 *   Python으로 갔다면 여기서 타입 계약을 손으로 동기화해야 했다.
 *
 * [이 디렉터리의 규칙]
 * - `next/*` import 금지, `process.env` 직접 읽기 금지.
 *   외부 의존(기상 API, LLM, checkpointer)은 전부 주입받는다.
 * - 이유는 이식성이 아니라 **테스트 가능성**이다. 노드 안에서 모델을 만들면
 *   그 노드는 테스트할 수 없다. nodes.test.ts가 이 규칙에 의존한다.
 * ---------------------------------------------
 */
export const RecommendationState = Annotation.Root({
  /** 대상 농지 id. 입력. */
  fieldId: Annotation<string>,

  /** 수집된 기상 요약. collectWeather가 채운다. */
  weather: Annotation<WeatherWindow | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),

  /** 평가 대상 작물 후보. 입력 또는 기본 목록. */
  candidates: Annotation<CropProfile[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),

  /** 점수 계산 결과. rankCandidates가 채운다. */
  ranked: Annotation<SuitabilityResult[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),

  /** 사용자에게 보여줄 자연어 설명. explain이 채운다. */
  explanation: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => "",
  }),

  /** 복구 불가능한 실패 사유. 있으면 그래프를 조기 종료한다. */
  error: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
});

export type RecommendationStateType = typeof RecommendationState.State;
