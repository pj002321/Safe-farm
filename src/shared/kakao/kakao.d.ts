/**
 * ---------------------------------------------
 * [Feature]: 카카오맵 JavaScript SDK 전역 타입 선언
 *
 * [Description]
 * - 카카오 SDK 는 npm 패키지가 아니다. `<script>` 로 내려와 브라우저 전역에
 *   `window.kakao` 를 심는다. TypeScript 는 그걸 알 길이 없으므로 여기서
 *   "이런 전역이 있다"고 선언해 준다. 이 파일이 없으면 `new kakao.maps.Map(...)`
 *   이 전부 ts(2304) 오류가 된다.
 * - **런타임 코드가 한 줄도 아니다.** `.d.ts` 는 타입 검사에만 쓰이고 번들에
 *   실리지 않는다. 뒤집어 말하면 여기 적은 내용이 실제 SDK 와 달라도 빌드는
 *   통과한다 — 실물과 맞추는 것은 사람 몫이다. 공식 문서를 보고 적는다.
 * - **필요한 것만 적는다.** SDK 전체를 옮겨 적으면 유지가 안 된다. 화면이 새
 *   기능을 쓸 때 그때 한 줄씩 늘린다.
 * - **import / export 를 쓰지 않는다.** 하나라도 있으면 이 파일이 모듈로 바뀌어
 *   전역 선언이 전부 사라진다(그때는 `declare global` 로 감싸야 한다).
 *
 * [Usage]
 * ```ts
 * const center = new kakao.maps.LatLng(36.41, 128.16);
 * const map = new kakao.maps.Map(element, { center, level: 3 });
 * ```
 * ---------------------------------------------
 */

declare namespace kakao.maps {
  /**
   * SDK 초기화. `autoload=false` 로 스크립트를 불러왔을 때 이것을 불러야
   * 아래 클래스들이 실제로 생긴다. 자동 로드를 끄는 이유는 로더에 적는다.
   */
  function load(callback: () => void): void;

  /** 위경도 한 쌍. SDK 는 좌표를 늘 이 객체로 주고받는다 — 생 숫자를 받지 않는다. */
  class LatLng {
    constructor(lat: number, lng: number);
    getLat(): number;
    getLng(): number;
  }

  interface MapOptions {
    center: LatLng;
    /** 확대 수준. 1이 가장 가깝고 14가 가장 멀다. 필지 단위는 3 안팎. */
    level?: number;
  }

  /** 지도 배경 종류. 문자열 리터럴이 아니라 이 상수로 비교·지정한다(카카오 SDK 관례). */
  const MapTypeId: {
    readonly ROADMAP: string;
    /** 위성사진 + 도로·지명 오버레이. 사용자가 찾는 "스카이뷰"가 이 쪽이다. */
    readonly HYBRID: string;
    /** 위성사진만, 도로·지명 없음. */
    readonly SKYVIEW: string;
  };

  /**
   * 카카오 SDK 의 실제 이름이 `kakao.maps.Map` 이라 바꿀 수 없다. 전역 Map 을
   * 가리는 범위는 이 네임스페이스 안뿐이고, 우리 코드는 늘 `sdk.maps.Map` 으로
   * 한정해 부른다.
   */
  // biome-ignore lint/suspicious/noShadowRestrictedNames: SDK 의 실제 이름이라 바꿀 수 없다.
  class Map {
    constructor(container: HTMLElement, options: MapOptions);
    setCenter(position: LatLng): void;
    getCenter(): LatLng;
    /** 지도를 부드럽게 이동시킨다(점프하지 않는다). */
    panTo(position: LatLng): void;
    setLevel(level: number): void;
    /** 현재 확대 수준. `setBounds` 가 너무 가깝게 맞췄는지 확인하는 데 쓴다. */
    getLevel(): number;
    /** 배경을 일반 지도/위성사진으로 바꾼다. 값은 `MapTypeId` 상수를 쓴다. */
    setMapTypeId(mapTypeId: string): void;
    /** 여러 좌표가 전부 보이도록 중심·배율을 한 번에 맞춘다. */
    setBounds(bounds: LatLngBounds): void;
    /** 지금 화면에 보이는 좌표 범위. 격자를 화면 안에만 그릴 때 쓴다. */
    getBounds(): LatLngBounds;
    /**
     * 컨테이너 크기가 바뀐 뒤 부른다. `display:none` 상태에서 만들어진 지도는
     * 크기를 0으로 잡아 회색 네모로 남는데, 보이게 한 직후 이걸 부르면 살아난다.
     */
    relayout(): void;
  }

  /** 여러 좌표를 담아 "이걸 다 보여줘"라고 지도에 넘기는 상자. */
  class LatLngBounds {
    extend(latlng: LatLng): void;
    getSouthWest(): LatLng;
    getNorthEast(): LatLng;
  }

  interface MarkerOptions {
    position: LatLng;
    /** 생략하면 지도에 붙지 않은 마커가 만들어진다. 나중에 setMap 으로 붙인다. */
    map?: Map;
  }

  class Marker {
    constructor(options: MarkerOptions);
    setPosition(position: LatLng): void;
    /** null 을 넘기면 지도에서 뗀다. 마커를 지우는 공식 방법이다. */
    setMap(map: Map | null): void;
  }

  interface CustomOverlayOptions {
    position: LatLng;
    /** 마커 대신 얹을 실제 HTML 문자열. React 조각을 문자열로 굳혀 넘긴다. */
    content: string | HTMLElement;
    map?: Map;
    /** 좌표가 콘텐츠의 어디에 오는지. 1이면 바닥 중앙(핀처럼). 기본은 중앙(0.5). */
    yAnchor?: number;
  }

  /** 이미지 한 장뿐인 Marker 와 달리 원하는 HTML(아이콘+글자)을 그대로 지도 위에 얹는다. */
  class CustomOverlay {
    constructor(options: CustomOverlayOptions);
    setMap(map: Map | null): void;
  }

  interface PolygonOptions {
    /** 경계선 좌표. 시군구처럼 구멍 없는 단순 다각형 하나만 쓴다(외곽 고리 하나). */
    path: LatLng[] | LatLng[][];
    strokeWeight?: number;
    strokeColor?: string;
    strokeOpacity?: number;
    fillColor?: string;
    fillOpacity?: number;
  }

  /** 시군구 색칠 지도(choropleth)처럼 면을 채우는 다각형. */
  class Polygon {
    constructor(options: PolygonOptions);
    setMap(map: Map | null): void;
    setOptions(options: Partial<PolygonOptions>): void;
  }

  interface PolylineOptions {
    path: LatLng[];
    strokeWeight?: number;
    strokeColor?: string;
    strokeOpacity?: number;
    /** 선 모양. "solid"(실선)·"shortdash"(점선) 등 — 지나온 길/예보를 가르는 데 쓴다. */
    strokeStyle?: string;
  }

  /** 이어진 선. 태풍 경로처럼 순서가 있는 좌표열을 그릴 때 쓴다(면을 채우지 않는다). */
  class Polyline {
    constructor(options: PolylineOptions);
    setMap(map: Map | null): void;
  }

  interface CircleOptions {
    center: LatLng;
    /** 반경. **단위는 미터다** — km 값을 그대로 넣으면 안 된다. */
    radius: number;
    strokeWeight?: number;
    strokeColor?: string;
    strokeOpacity?: number;
    fillColor?: string;
    fillOpacity?: number;
  }

  /** 반경 원. 태풍 예보원·강풍반경처럼 "이 안 어딘가"를 나타낼 때 쓴다. */
  class Circle {
    constructor(options: CircleOptions);
    setMap(map: Map | null): void;
  }

  /** 지도 클릭 시 핸들러가 받는 값. 우리가 쓰는 건 좌표 하나뿐이다. */
  interface MouseEvent {
    latLng: LatLng;
  }

  namespace event {
    /** 지도 클릭. `mouseEvent.latLng` 에 클릭 지점이 담긴다. */
    function addListener(
      target: Map,
      type: "click",
      handler: (mouseEvent: MouseEvent) => void,
    ): void;
    /** 폴리곤 클릭. Map 과 별개로 도형 자체에도 리스너를 붙일 수 있다(SDK 공통 동작). */
    function addListener(
      target: Polygon,
      type: "click",
      handler: (mouseEvent: MouseEvent) => void,
    ): void;
    /**
     * 지도의 이동·확대가 **멎었을 때** 한 번 온다. 드래그하는 내내 오지 않으므로
     * 중앙 핀 방식이 이걸 듣는다 — 손을 뗀 순간에만 좌표를 갱신하면 된다.
     *
     * **핸들러에 인자가 없다.** 좌표는 이벤트가 주지 않으므로 `map.getCenter()`
     * 로 지도에게 직접 물어봐야 한다.
     */
    function addListener(target: Map, type: "idle", handler: () => void): void;

    function removeListener(
      target: Map,
      type: "click",
      handler: (mouseEvent: MouseEvent) => void,
    ): void;
    function removeListener(
      target: Map,
      type: "idle",
      handler: () => void,
    ): void;
  }

  /**
   * 주소↔좌표 변환. **SDK URL 에 `libraries=services` 가 있어야 생긴다.**
   * 로더가 이미 붙여 두었다 — 빠지면 여기가 통째로 undefined 다.
   */
  namespace services {
    /**
     * 검색 결과 상태.
     *
     * **실제 문자열 값에 기대지 않는다.** `status === "OK"` 로 쓰면 카카오가
     * 내부 표현을 바꿨을 때 조용히 전부 실패한다. 비교는 이 객체의 필드로 한다.
     */
    const Status: {
      readonly OK: string;
      readonly ZERO_RESULT: string;
      readonly ERROR: string;
    };

    interface AddressResult {
      /** 경도. ⚠️ **문자열이다.** 숫자로 쓰려면 변환해야 한다. */
      x: string;
      /** 위도. 역시 문자열. */
      y: string;
      /** 검색에 걸린 주소 전문. */
      address_name: string;
    }

    /** 좌표 → 주소 결과. */
    interface Coord2AddressResult {
      /** 도로명 주소. **산간·농지·신규 조성지는 null 이다** — 밭이 딱 그런 곳이다. */
      road_address: { address_name: string } | null;
      /** 지번 주소. 이쪽은 항상 있으므로 최종 폴백으로 쓴다. */
      address: { address_name: string };
    }

    /**
     * 좌표 → 행정구역 결과. **보통 두 건이 온다.**
     *
     * `region_type` 이 `"B"` 면 법정동, `"H"` 면 행정동이다. 우리가 저장할
     * `regionCode` 는 **법정동 코드**이므로 `"B"` 를 골라야 한다. 순서에 기대
     * `result[0]` 을 쓰면 동네에 따라 행정동 코드가 섞여 들어온다.
     */
    interface Coord2RegionResult {
      region_type: "B" | "H";
      /** 시·도부터 읍면동까지 이어 붙인 이름. */
      address_name: string;
      region_1depth_name: string;
      region_2depth_name: string;
      region_3depth_name: string;
      /** 법정동 코드 10자리. 위성·통계 조회의 키다. */
      code: string;
    }

    class Geocoder {
      addressSearch(
        query: string,
        callback: (result: AddressResult[], status: string) => void,
      ): void;
      /** ⚠️ 인자가 **(경도, 위도)** 순서다. 위경도 순서가 아니다. */
      coord2Address(
        lng: number,
        lat: number,
        callback: (result: Coord2AddressResult[], status: string) => void,
      ): void;
      /** ⚠️ 여기도 **(경도, 위도)** 순서다. */
      coord2RegionCode(
        lng: number,
        lat: number,
        callback: (result: Coord2RegionResult[], status: string) => void,
      ): void;
    }
  }
}

/**
 * `window.kakao` 로도 같은 것을 가리킨다.
 *
 * **옵셔널(`?`)인 것이 핵심이다.** 스크립트가 아직 안 내려왔을 수 있으므로
 * 로더는 `window.kakao` 의 존재로 판단한다. 맨 이름 `kakao` 로는 존재 여부를
 * 물어볼 수 없다 — 선언되지 않은 전역을 읽으면 ReferenceError 로 죽는다.
 */
interface Window {
  kakao?: typeof kakao;
}
