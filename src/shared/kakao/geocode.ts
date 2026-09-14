/**
 * ---------------------------------------------
 * [Feature]: 주소 → 좌표 변환 (카카오 Geocoder)
 *
 * [Description]
 * - 카카오 SDK 의 주소 검색을 Promise 로 감싼다. SDK 는 콜백만 주는데, 콜백을
 *   컴포넌트에서 직접 쓰면 `await` 과 섞이지 않아 로딩 표시가 꼬인다.
 * - **찾지 못한 것은 오류가 아니다.** 오타는 흔한 일이라 throw 하지 않고 null 을
 *   돌려준다. 부르는 쪽이 "주소를 찾지 못했습니다"를 보이면 된다. 예외로 만들면
 *   호출부마다 try/catch 가 생기고, 진짜 오류와 구분이 안 된다.
 * - 여러 건이 나와도 첫 번째만 쓴다. 밭 등록은 지도에서 직접 찍어 보정하는
 *   흐름이라 목록을 고르게 할 필요가 없다.
 *
 * [Usage]
 * ```ts
 * const found = await searchAddress("경북 상주시 낙동면");
 * if (found) onChange(found);
 * ```
 * ---------------------------------------------
 */

/**
 * 검색 결과 좌표.
 *
 * `features/monitoring/domain/geo` 의 `LatLon` 과 필드가 같지만 **일부러
 * import 하지 않는다.** 의존성은 `shared → features → app` 단방향이고, shared 가
 * features 를 부르면 그 규칙이 깨진다. TypeScript 는 이름이 아니라 **구조**로
 * 타입을 보므로, 필드가 같으면 `LatLon` 자리에 그대로 넣을 수 있다.
 */
export interface GeocodedCoord {
  lat: number;
  lon: number;
}

export function searchAddress(query: string): Promise<GeocodedCoord | null> {
  return new Promise((resolve) => {
    const sdk = window.kakao;
    if (!sdk) {
      resolve(null);
      return;
    }

    const geocoder = new sdk.maps.services.Geocoder();

    geocoder.addressSearch(query, (result, status) => {
      if (status !== sdk.maps.services.Status.OK || result.length === 0) {
        resolve(null);
        return;
      }

      // x 가 경도, y 가 위도다. 게다가 둘 다 문자열이라 변환이 필요하다.
      const [first] = result;
      resolve({ lat: Number(first.y), lon: Number(first.x) });
    });
  });
}
