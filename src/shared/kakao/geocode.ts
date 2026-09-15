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

/** 좌표를 되돌린 결과. `LocationSummary` 가 그대로 쓰는 모양이다. */
export interface ReverseGeocoded {
  /** 도로명 주소. 없으면 지번 주소로 떨어진다. */
  addressKo: string;
  /** 법정동 코드 10자리. */
  regionCode: string;
  /** 시·도 시·군·구 읍·면·동. */
  regionKo: string;
}

/** 좌표 → 상세 주소 한 줄. */
function toAddress(
  geocoder: kakao.maps.services.Geocoder,
  coord: GeocodedCoord,
  okStatus: string,
): Promise<string | null> {
  return new Promise((resolve) => {
    // ⚠️ (경도, 위도) 순서다. 바꿔 넣어도 오류 없이 엉뚱한 주소가 나온다.
    geocoder.coord2Address(coord.lon, coord.lat, (result, status) => {
      if (status !== okStatus || result.length === 0) {
        resolve(null);
        return;
      }

      // 밭·산간에는 도로명이 없는 경우가 흔하다. 그때는 지번이 유일한 주소다.
      const [first] = result;
      resolve(first.road_address?.address_name ?? first.address.address_name);
    });
  });
}

/** 좌표 → 법정동 코드와 이름. */
function toRegion(
  geocoder: kakao.maps.services.Geocoder,
  coord: GeocodedCoord,
  okStatus: string,
): Promise<{ code: string; nameKo: string } | null> {
  return new Promise((resolve) => {
    geocoder.coord2RegionCode(coord.lon, coord.lat, (result, status) => {
      if (status !== okStatus) {
        resolve(null);
        return;
      }

      // 법정동(B)과 행정동(H)이 함께 온다. 순서에 기대면 동네에 따라 행정동
      // 코드가 섞여 들어오므로 종류로 고른다.
      const legal = result.find((one) => one.region_type === "B");
      if (!legal) {
        resolve(null);
        return;
      }

      resolve({ code: legal.code, nameKo: legal.address_name });
    });
  });
}

/** 좌표 하나를 주소·행정구역으로 되돌린다. 바다처럼 답이 없는 곳은 null. */
export async function reverseGeocode(
  coord: GeocodedCoord,
): Promise<ReverseGeocoded | null> {
  const sdk = window.kakao;
  if (!sdk) return null;

  const geocoder = new sdk.maps.services.Geocoder();
  const okStatus = sdk.maps.services.Status.OK;

  // 두 호출은 서로를 기다릴 이유가 없다. 순서대로 하면 왕복이 두 배가 되는데,
  // 지도를 움직일 때마다 도는 경로라 그 지연이 화면에 그대로 보인다.
  const [addressKo, region] = await Promise.all([
    toAddress(geocoder, coord, okStatus),
    toRegion(geocoder, coord, okStatus),
  ]);

  // ⚠️ 육지인지 가르는 신호는 행정구역이 아니라 **주소**다.
  // 법정동 폴리곤은 해상 경계까지 뻗어 있어 바다 위에서도 coord2RegionCode 가
  // 멀쩡한 코드를 돌려준다(남해 앞바다 → 남해군 상주면). 반면 지번은 필지에만
  // 붙으므로 바다에서는 빈다.
  //
  // 한때 "도로명 없는 밭·산간이 막힌다"는 이유로 주소를 선택으로 돌렸는데,
  // 그건 toAddress 가 이미 지번으로 떨어뜨려 해결돼 있다. 둘 다 요구해도
  // 육지 필지는 막히지 않고, 대신 바다가 걸러진다.
  if (!region || !addressKo) return null;

  return {
    addressKo,
    regionCode: region.code,
    regionKo: region.nameKo,
  };
}
