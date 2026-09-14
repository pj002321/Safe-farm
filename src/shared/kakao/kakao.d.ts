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

  // biome-ignore lint/suspicious/noShadowRestrictedNames: 카카오 SDK 의 실제 이름이
  // `kakao.maps.Map` 이라 바꿀 수 없다. 전역 Map 을 가리는 범위는 이 네임스페이스
  // 안뿐이고, 우리 코드는 늘 `sdk.maps.Map` 으로 한정해 부른다.
  class Map {
    constructor(container: HTMLElement, options: MapOptions);
    setCenter(position: LatLng): void;
    getCenter(): LatLng;
    setLevel(level: number): void;
    /**
     * 컨테이너 크기가 바뀐 뒤 부른다. `display:none` 상태에서 만들어진 지도는
     * 크기를 0으로 잡아 회색 네모로 남는데, 보이게 한 직후 이걸 부르면 살아난다.
     */
    relayout(): void;
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

  /** 지도 클릭 시 핸들러가 받는 값. 우리가 쓰는 건 좌표 하나뿐이다. */
  interface MouseEvent {
    latLng: LatLng;
  }

  namespace event {
    /** 지금 필요한 건 지도 클릭 하나뿐이라 그 형태만 좁게 선언한다. */
    function addListener(
      target: Map,
      type: "click",
      handler: (mouseEvent: MouseEvent) => void,
    ): void;
    function removeListener(
      target: Map,
      type: "click",
      handler: (mouseEvent: MouseEvent) => void,
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

    class Geocoder {
      addressSearch(
        query: string,
        callback: (result: AddressResult[], status: string) => void,
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
