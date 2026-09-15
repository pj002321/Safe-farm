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

  // 바다·비무장지대처럼 행정구역이 없는 곳이 있다. 하나라도 비면 표시할 수 없다.
  // 행정구역은 필수다 — 기상·위성 조회의 키라서 없으면 등록해도 쓸 수 없다.
  // 반면 상세 주소는 표시용이라, 못 얻으면 행정구역 이름으로 대신한다.
  // 둘 다 요구하면 주소만 비는 지점에서 멀쩡한 밭이 등록을 못 한다.
  if (!region) return null;

  return {
    addressKo: addressKo ?? region.nameKo,
    regionCode: region.code,
    regionKo: region.nameKo,
  };
}
