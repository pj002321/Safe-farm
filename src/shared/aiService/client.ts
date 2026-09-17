import "server-only";

/**
 * ---------------------------------------------
 * [Feature]: ai-service(FastAPI) 호출 클라이언트
 *
 * [Description]
 * - **서버에서만 부른다.** `server-only` 라 클라이언트 번들에 섞이면 빌드가 깨진다.
 *   브라우저가 ai-service 를 직접 부르게 두면 서비스 토큰이 노출되고, 그 순간
 *   남이 우리 OpenAI 요금을 쓴다.
 * - Railway 내부망(`<서비스명>.railway.internal`)으로 간다. ai-service 에는
 *   **공개 도메인을 붙이지 않는다.** 내부망 주소는 인터넷에서 해석되지 않는다.
 * - 실패를 **예외가 아니라 결과 값**으로 돌려준다. 이 호출은 실패가 정상 경로의
 *   일부다(아직 구현 안 된 기능, DB 미연결, 콜드 스타트). 화면이 그때마다
 *   500 을 띄우는 대신 "지금은 안 된다"를 말할 수 있어야 한다.
 * - **타임아웃을 반드시 건다.** 없으면 ai-service 가 멈췄을 때 Next 의 요청이
 *   함께 매달려, 한쪽 장애가 전체 장애가 된다.
 *
 * [Usage]
 * ```ts
 * const result = await aiService.status();
 * if (!result.ok) return { error: result.reason };
 * ```
 * ---------------------------------------------
 */

/** ai-service 가 알려주는 능력. 화면이 "지금 되는가"를 이걸로 판단한다. */
export interface AiServiceStatus {
  service: string;
  version: string;
  /** DB·LLM 이 모두 연결됐는가. false 면 리포트 생성을 요청하지 않는다. */
  ready: boolean;
  capabilities: {
    embedding: boolean;
    retrieval: boolean;
    reportGeneration: boolean;
  };
  config: {
    database: boolean;
    llm: boolean;
    embedModel: string;
    dimension: number;
  };
}

/** 시군구 경계 + 올해 누적 GDD·평년 대비 편차·색상. `/map` 색칠 지도(V1-37)가 그대로 그린다. */
export interface SigunguGddFeatureCollection {
  type: "FeatureCollection";
  /** 누적 구간의 마지막 날짜(YYYY-MM-DD, 서버가 응답을 만든 날). */
  asOf?: string | null;
  features: Array<{
    type: "Feature";
    properties: {
      code: string;
      name: string;
      /** 평년값이 없는 관측소(AWS 다수)에 걸리면 GDD 관련 필드가 전부 없다. */
      station?: string;
      stationName?: string;
      actualGdd?: number | null;
      normalGdd?: number | null;
      deviationPct?: number | null;
      color?: string;
      label?: string;
    };
    geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
  }>;
}

/** 시군구 경계 + 발효 중인 기상특보. `/map` 특보 레이어(V1-39)가 그대로 그린다. */
export interface SigunguWarnFeatureCollection {
  type: "FeatureCollection";
  /** 특보 스냅샷을 가져온 시각(ISO). 스냅샷이 아예 없으면 null. */
  asOf?: string | null;
  features: Array<{
    type: "Feature";
    properties: {
      code: string;
      name: string;
      regId?: string;
      /** 발효 중인 특보 종류(예: ["강풍", "호우"]). 없으면 빈 배열. */
      warnings?: string[];
      /** 발효 중인 특보가 있을 때만 값이 있다 — 없으면 폴리곤을 안 그린다. */
      color?: string | null;
      label?: string | null;
    };
    geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
  }>;
}

/** 오늘 남은 질문 횟수. 상한은 ai-service 의 `DAILY_ASK_LIMIT` 이 정한다 — 여기서 상수로 두지 않는다. */
export interface AskQuota {
  limit: number;
  used: number;
  remaining: number;
}

/**
 * 초기 화면에 띄울 추천 질문. `basis` 는 이 질문들이 어느 작물·단계에서 나왔는지
 * 적은 한 줄 — 밭을 안 골랐으면 null 이고 질문도 일반 질문이 된다.
 */
export interface AskSuggestions {
  questions: string[];
  basis: string | null;
}

/** `/v1/ask` 에 보내는 값. **`user_id` 는 여기 없다** — 세션에서 채우므로 부르는 쪽이 정하지 못한다. */
export interface AskInput {
  question: string;
  plotId?: string | null;
}

/** 시군구 경계 + 가장 최근 관측된 일 강수량·색상. `/map` 강수 레이어가 그대로 그린다. */
export interface SigunguRainFeatureCollection {
  type: "FeatureCollection";
  asOf?: string | null;
  features: Array<{
    type: "Feature";
    properties: {
      code: string;
      name: string;
      station?: string;
      stationName?: string;
      rainMm?: number | null;
      color?: string;
      label?: string;
    };
    geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
  }>;
}

/** 시군구 경계 + 가장 최근 관측된 최대풍속·색상. `/map` 바람 레이어가 그대로 그린다. */
export interface SigunguWindFeatureCollection {
  type: "FeatureCollection";
  asOf?: string | null;
  features: Array<{
    type: "Feature";
    properties: {
      code: string;
      name: string;
      station?: string;
      stationName?: string;
      windMax?: number | null;
      color?: string;
      label?: string;
    };
    geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
  }>;
}

/** 밭 좌표 기준 7일 예보. `/weather` 탭이 그대로 목록으로 그린다. */
export interface PlotForecast {
  days: Array<{
    date: string;
    tempMax: number | null;
    tempMin: number | null;
    rainfallMm: number | null;
    rainChance: number | null;
    windMax: number | null;
    humidityPct: number | null;
  }>;
  /** 최근접 관측소 기준 누적 강수량(mm). 그 구간에 관측이 없으면 null(판정 보류). */
  rainfall3d: number | null;
  rainfall5d: number | null;
  rainfall7d: number | null;
  /** 최근 14일 하루치 GDD. 재배 중인 작물이 없으면 null. `/weather` 생육속도 막대(V1-69)가 그린다. */
  growthSeries: Array<{ date: string; gdd: number }> | null;
  /** 이 밭 작물의 기온·관수 기준. 기상 수치 옆에 "이게 이 작물에 어떤 의미인지"를
   * 병기하는 근거(V1-64) — 재배 중인 작물이 없으면 null. */
  cropImpact: {
    cropNameKo: string;
    baseTempC: number;
    upperTempC: number | null;
    stageName: string | null;
    waterNeedMm: number | null;
  } | null;
}

export type AiResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: AiFailure; detail?: string };

/**
 * 스트리밍 호출의 결과. 본문을 읽지 않고 `Response` 를 그대로 넘긴다 —
 * SSE 를 여기서 파싱하면 프록시가 한 번, 브라우저가 또 한 번 파싱하게 된다.
 *
 * ⚠️ 이 모듈은 `server-only` 다. Response 를 클라이언트로 들고 나가지 말 것.
 */
export type AiStreamResult =
  | { ok: true; response: Response }
  | { ok: false; reason: AiFailure; detail?: string };

/**
 * 실패 종류. 화면이 문구를 고르는 근거이자, 로그에서 원인을 나누는 축이다.
 * 전부 "실패"로 뭉개면 설정 누락과 일시 장애를 구분할 수 없다.
 */
export type AiFailure =
  | "not-configured" // 우리 쪽 환경변수가 없다 — 배포 설정 문제
  | "unauthorized" // 토큰 불일치 — 양쪽 값이 어긋났다
  | "unavailable" // 연결 자체가 안 된다 — 서비스가 죽었거나 콜드 스타트
  | "timeout"
  | "bad-response"; // 200 인데 모양이 다르다 — 계약이 어긋났다

/** 기본 타임아웃. 상태 조회는 짧게, LLM 호출은 부르는 쪽에서 늘린다. */
const DEFAULT_TIMEOUT_MS = 5_000;

/** 밭 예보 갱신 주기(초, V1-61). 개발 중 바로 바꿀 수 있게 상수 하나로 둔다.
 * 개발 서버(`next dev`)는 항상 매 요청 새로 받아온다 — 이 캐시는 배포 환경에서만 보인다. */
const WEATHER_REVALIDATE_SEC = 60 * 60;

function config(): { baseUrl: string; token: string } | null {
  const baseUrl = process.env.AI_SERVICE_URL?.trim();
  const token = process.env.AI_SERVICE_TOKEN?.trim();
  if (!baseUrl || !token) return null;
  // 뒤 슬래시를 걷어낸다. 있으면 `//v1/status` 가 되어 404 가 난다.
  return { baseUrl: baseUrl.replace(/\/+$/, ""), token };
}

async function call<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number; revalidateSec?: number } = {},
): Promise<AiResult<T>> {
  const cfg = config();
  if (!cfg) {
    return {
      ok: false,
      reason: "not-configured",
      detail:
        "AI_SERVICE_URL 과 AI_SERVICE_TOKEN 이 필요합니다. Railway 의 Next 서비스 변수를 확인하세요.",
    };
  }

  const { timeoutMs = DEFAULT_TIMEOUT_MS, revalidateSec, ...rest } = init;
  // AbortSignal.timeout 은 Node 18+ 에 있다. setTimeout + controller 보다
  // 짧고, 타이머를 걷는 것을 잊을 여지가 없다.
  const signal = AbortSignal.timeout(timeoutMs);

  try {
    const response = await fetch(`${cfg.baseUrl}${path}`, {
      ...rest,
      signal,
      headers: {
        "Content-Type": "application/json",
        "X-Service-Token": cfg.token,
        ...rest.headers,
      },
      // 내부 호출은 기본적으로 캐시하지 않는다. 상태 조회가 캐시되면 "이미
      // 고쳤는데 화면은 계속 안 된다고 하는" 상황이 된다. revalidateSec 을
      // 준 호출(예: 밭 예보)만 그 주기로 캐시한다.
      ...(revalidateSec != null
        ? { next: { revalidate: revalidateSec } }
        : { cache: "no-store" as const }),
    });

    if (response.status === 401) {
      return {
        ok: false,
        reason: "unauthorized",
        detail: "양쪽 AI_SERVICE_TOKEN 값이 다릅니다.",
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        reason: "unavailable",
        detail: `ai-service 가 ${response.status} 를 돌려줬습니다.`,
      };
    }

    return { ok: true, data: (await response.json()) as T };
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return { ok: false, reason: "timeout", detail: `${timeoutMs}ms 초과` };
    }
    // 내부망 DNS 미해석, 서비스 다운, 콜드 스타트가 전부 여기로 온다.
    // 원문은 로그에만 — 내부 호스트명이 사용자 화면에 나가지 않게 한다.
    console.error("[ai-service] 호출 실패", error);
    return { ok: false, reason: "unavailable" };
  }
}

/**
 * 본문을 읽지 않고 응답을 그대로 돌려주는 호출. `/v1/ask` 는 답변을 토큰 단위로
 * 흘려보내므로 `response.json()` 을 기다리면 스트리밍이 의미를 잃는다.
 *
 * ⚠️ 타임아웃이 **전체 수명**에 걸린다. `AbortSignal.timeout` 은 본문을 읽는 동안에도
 *    계속 세므로, 값이 짧으면 답변이 길어질 때 문장 중간에서 끊긴다. 반대로 없애면
 *    ai-service 가 멈췄을 때 Next 의 요청이 함께 매달린다 — 그래서 넉넉히 주되 건다.
 */
async function stream(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<AiStreamResult> {
  const cfg = config();
  if (!cfg) {
    return {
      ok: false,
      reason: "not-configured",
      detail:
        "AI_SERVICE_URL 과 AI_SERVICE_TOKEN 이 필요합니다. Railway 의 Next 서비스 변수를 확인하세요.",
    };
  }

  const { timeoutMs = ASK_TIMEOUT_MS, ...rest } = init;

  try {
    const response = await fetch(`${cfg.baseUrl}${path}`, {
      ...rest,
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "Content-Type": "application/json",
        "X-Service-Token": cfg.token,
        ...rest.headers,
      },
      cache: "no-store",
    });

    if (response.status === 401) {
      return {
        ok: false,
        reason: "unauthorized",
        detail: "양쪽 AI_SERVICE_TOKEN 값이 다릅니다.",
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        reason: "unavailable",
        detail: `ai-service 가 ${response.status} 를 돌려줬습니다.`,
      };
    }

    return { ok: true, response };
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return { ok: false, reason: "timeout", detail: `${timeoutMs}ms 초과` };
    }
    console.error("[ai-service] 스트림 호출 실패", error);
    return { ok: false, reason: "unavailable" };
  }
}

/** 질문 한 건의 한계. 검색 + LLM 생성 + 토큰 스트리밍을 모두 덮어야 한다. */
const ASK_TIMEOUT_MS = 60_000;

export const aiService = {
  /** 서비스가 살아 있는지, 무엇을 할 수 있는지. */
  status: () => call<AiServiceStatus>("/v1/status"),
  /** 시군구 250개 폴리곤 + GDD 편차. 매번 DB 를 훑으므로 상태 조회보다 타임아웃을 넉넉히 준다. */
  sigunguGdd: () =>
    call<SigunguGddFeatureCollection>("/v1/map/sigungu-gdd", {
      timeoutMs: 15_000,
    }),
  /** 시군구 250개 폴리곤 + 발효 중인 기상특보. */
  sigunguWarn: () =>
    call<SigunguWarnFeatureCollection>("/v1/map/sigungu-warn", {
      timeoutMs: 15_000,
    }),

  /**
   * 오늘 남은 질문 횟수. 화면이 묻기 전에 보여주는 값이라 짧게 끊는다 —
   * 이게 늦어져서 질문 화면 자체가 늦게 뜨면 손해가 더 크다.
   */
  askQuota: (userId: string) =>
    call<AskQuota>(`/v1/ask/quota?user_id=${encodeURIComponent(userId)}`),

  /**
   * 현재 생육단계에 맞는 추천 질문 3건. 밭을 안 골랐으면 일반 질문이 온다.
   *
   * `userId` 를 함께 보내는 이유는 질문 문장에 작물 이름과 생육단계가 박히기
   * 때문이다. ai-service 가 그 값으로 밭 소유를 확인한다.
   */
  askSuggestions: (userId: string, plotId?: string | null) => {
    const query = new URLSearchParams({ user_id: userId });
    if (plotId) query.set("plot_id", plotId);
    return call<AskSuggestions>(`/v1/ask/suggestions?${query.toString()}`);
  },

  /**
   * 질문 한 건. 근거를 찾으면 SSE 로, 못 찾거나 막히면 JSON 으로 온다 —
   * 부르는 쪽이 `Content-Type` 을 보고 갈라야 한다.
   *
   * `userId` 는 **세션에서 확인한 값만** 넘긴다. 브라우저가 보낸 값을 그대로
   * 실으면 남의 이력에 질문을 쌓고 남의 한도를 태울 수 있다.
   */
  ask: (userId: string, input: AskInput) =>
    stream("/v1/ask", {
      method: "POST",
      body: JSON.stringify({
        question: input.question,
        user_id: userId,
        plot_id: input.plotId ?? null,
      }),
    }),

  /** 답변 하나에 up/down 평가와 사유를 남긴다. */
  askFeedback: (
    historyId: string,
    userId: string,
    rating: "up" | "down",
    reason?: string | null,
  ) =>
    call<{ ok: boolean }>(`/v1/ask/${encodeURIComponent(historyId)}/feedback`, {
      method: "POST",
      body: JSON.stringify({
        user_id: userId,
        rating,
        reason: reason ?? null,
      }),
    }),
  /** 시군구 250개 폴리곤 + 최근 관측 강수량. */
  sigunguRain: () =>
    call<SigunguRainFeatureCollection>("/v1/map/sigungu-rain", {
      timeoutMs: 15_000,
    }),
  /** 시군구 250개 폴리곤 + 최근 관측 최대풍속. */
  sigunguWind: () =>
    call<SigunguWindFeatureCollection>("/v1/map/sigungu-wind", {
      timeoutMs: 15_000,
    }),
  /** 밭 좌표 기준 7일 예보(기온·강수·최대풍속). Open-Meteo 를 그때그때 불러온다.
   * plotId 를 주면 최근 14일 하루치 GDD(growthSeries)도 같이 온다. */
  plotForecast: (lat: number, lon: number, plotId?: string) =>
    call<PlotForecast>(
      `/v1/weather/plot?lat=${lat}&lon=${lon}${plotId ? `&plot_id=${plotId}` : ""}`,
      { revalidateSec: WEATHER_REVALIDATE_SEC },
    ),
  /**
   * 밭 하나만 즉시 판정해 오늘 할 일 카드를 만든다. 자정 배치를 기다리지 않고
   * 밭 등록·재배 추가 직후 호출한다(registerPlot/addCultivations).
   */
  generateTasks: (plotId: string) =>
    call<{ created: number }>(`/v1/tasks/generate?plot_id=${plotId}`, {
      method: "POST",
    }),
};
