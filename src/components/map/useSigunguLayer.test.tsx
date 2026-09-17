// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POLL_MS } from "./sigunguLayers";
import { useSigunguLayer, useSigunguPolygons } from "./useSigunguLayer";

/**
 * 이 두 가지는 **실제로 나갔던 결함**이다. 둘 다 조용히 죽는 종류라
 * (화면은 멀쩡해 보이고 값만 안 바뀐다) 회귀 테스트가 없으면 다시 들어온다.
 */

const EMPTY_COLLECTION = {
  type: "FeatureCollection",
  asOf: "2026-09-17",
  features: [],
};

function stubFetch(body: unknown = EMPTY_COLLECTION) {
  const fetchMock = vi.fn(() =>
    Promise.resolve({ json: () => Promise.resolve(body) } as Response),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("useSigunguLayer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("특보는 첫 응답이 온 뒤에도 계속 폴링한다", async () => {
    const fetchMock = stubFetch();
    renderHook(() => useSigunguLayer("warn"));

    // 첫 요청이 끝나는 지점. 예전 구현은 여기서 상태가 바뀌며 효과가 재실행되고,
    // 그 정리 함수가 방금 건 interval 을 껐다 — 이후 영원히 한 건에서 멎었다.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // 두 번째 응답 뒤에도 살아 있어야 "실시간 반영 중" 표시가 거짓이 아니다.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("특보가 아닌 레이어는 폴링하지 않는다 — 한 번 받고 만다", async () => {
    const fetchMock = stubFetch();
    renderHook(() => useSigunguLayer("gdd"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("이미 받아 둔 레이어로 되돌아오면 다시 받지 않는다", async () => {
    const fetchMock = stubFetch();
    const { rerender } = renderHook(({ layer }) => useSigunguLayer(layer), {
      initialProps: { layer: "gdd" as const },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    rerender({ layer: "rain" as unknown as "gdd" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    rerender({ layer: "gdd" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("다시 시도를 누르면 실패한 레이어를 한 번 더 받는다", async () => {
    // features 가 없는 응답 = ai-service 미연결. 200 이지만 실패로 친다.
    const fetchMock = stubFetch({ status: "not-configured" });
    const { result } = renderHook(() => useSigunguLayer("gdd"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.current).toBe("error");

    await act(async () => {
      result.current.retry();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("특보 레이어가 아니면 warn 을 내주지 않는다", async () => {
    stubFetch();
    const { result } = renderHook(() => useSigunguLayer("gdd"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.current).not.toBeNull();
    expect(result.current.warn).toBeNull();
  });
});

describe("useSigunguPolygons", () => {
  const created: Array<Record<string, unknown>> = [];
  /**
   * **참조가 렌더마다 바뀌지 않아야 한다.** 인라인 화살표를 넘기면 의존성이
   * 매번 달라져 효과가 늘 재실행되고, 그러면 "지도가 늦게 와도 그린다"를
   * 검사하는 아래 테스트가 무슨 구현에서도 통과한다(실제로 그랬다).
   * 화면은 useState 의 setter 를 넘기므로 이쪽도 고정 참조여야 한다.
   */
  const onSelect = () => {};

  beforeEach(() => {
    created.length = 0;
    vi.stubGlobal("window", window);
    (window as Window).kakao = {
      maps: {
        LatLng: class {
          constructor(
            public lat: number,
            public lng: number,
          ) {}
        },
        Polygon: class {
          constructor(options: Record<string, unknown>) {
            created.push(options);
          }
          setMap() {}
        },
        event: { addListener: () => {} },
      },
    } as unknown as typeof kakao;
  });

  afterEach(() => {
    (window as Window).kakao = undefined;
  });

  const DATA = {
    type: "FeatureCollection" as const,
    asOf: "2026-09-17",
    features: [
      {
        type: "Feature" as const,
        properties: { code: "47110", name: "상주시", color: "#dc2626" },
        geometry: {
          type: "Polygon" as const,
          coordinates: [
            [
              [128.1, 36.4],
              [128.2, 36.4],
              [128.2, 36.5],
            ],
          ],
        },
      },
    ],
  };

  it("데이터가 지도보다 먼저 와도, 지도가 생긴 뒤에 그린다", () => {
    const fakeMap = {} as kakao.maps.Map;

    // 카카오 SDK(외부)가 우리 API 보다 느린 날의 순서다. 예전에는 지도를 ref 로
    // 들고 있어 이 시점 이후 다시 그릴 계기가 없었고, 지도가 빈 채로 남았다.
    const { rerender } = renderHook(
      ({ map }) =>
        useSigunguPolygons({
          map,
          layer: "gdd",
          data: DATA,
          selectedCode: null,
          onSelect,
        }),
      { initialProps: { map: null as kakao.maps.Map | null } },
    );
    expect(created).toHaveLength(0);

    rerender({ map: fakeMap });
    expect(created).toHaveLength(1);
  });

  it("특보 레이어에서 색 없는 시군구는 그리지 않는다", () => {
    const fakeMap = {} as kakao.maps.Map;
    const noColor = {
      ...DATA,
      features: [
        {
          ...DATA.features[0],
          properties: { code: "47110", name: "상주시", color: null },
        },
      ],
    };

    renderHook(() =>
      useSigunguPolygons({
        map: fakeMap,
        layer: "warn",
        data: noColor,
        selectedCode: null,
        onSelect,
      }),
    );
    expect(created).toHaveLength(0);
  });
});
