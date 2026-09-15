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

export type AiResult<T> =
  | { ok: true; data: T }
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

function config(): { baseUrl: string; token: string } | null {
  const baseUrl = process.env.AI_SERVICE_URL?.trim();
  const token = process.env.AI_SERVICE_TOKEN?.trim();
  if (!baseUrl || !token) return null;
  // 뒤 슬래시를 걷어낸다. 있으면 `//v1/status` 가 되어 404 가 난다.
  return { baseUrl: baseUrl.replace(/\/+$/, ""), token };
}

async function call<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
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

  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = init;
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
      // 내부 호출은 캐시하지 않는다. 상태 조회가 캐시되면 "이미 고쳤는데
      // 화면은 계속 안 된다고 하는" 상황이 된다.
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
};
