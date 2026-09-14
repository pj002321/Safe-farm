"use client";

import Script from "next/script";
import { useEffect } from "react";

/**
 * ---------------------------------------------
 * [Feature]: 카카오맵 SDK 스크립트 로더
 *
 * [Description]
 * - 카카오 SDK 를 내려받고 "쓸 준비가 됐는지"만 부모에게 알린다. 지도를 그리는
 *   일은 하지 않는다 — 실패 경우가 많은 로딩을 한 곳에 가둬 두기 위해서다.
 * - **`autoload=false` 로 받는다.** 기본값은 스크립트가 파싱되는 즉시 내부 모듈을
 *   초기화하는데, 그 시점이 React 렌더와 어긋나 `kakao.maps` 가 있다 없다 한다.
 *   끄고 나서 `kakao.maps.load()` 로 우리가 시점을 잡는다. 그래서 로딩이
 *   **2단계**다: ① 스크립트 내려받기 → ② `maps.load()` 초기화.
 * - **`onLoad` 가 아니라 `onReady` 를 쓴다.** `onLoad` 는 스크립트가 처음 내려올
 *   때 한 번만 불린다. 다른 페이지에 갔다 돌아오면 스크립트는 이미 캐시에 있어
 *   `onLoad` 가 안 불리고, 지도가 영영 "불러오는 중"에서 멈춘다. `onReady` 는
 *   마운트될 때마다 불린다 — Next 공식 문서가 지도 임베드를 바로 이 예로 든다.
 * - 키가 없으면 요청 자체를 하지 않는다. 키 없이 부르면 카카오가 401 을 주는데
 *   그건 콘솔에만 찍히고 화면에는 아무 말도 안 나온다.
 * - Supabase 설정(`shared/supabase/config.ts`)처럼 던지지 않는다. 지도는 페이지의
 *   일부일 뿐이라, 키가 없다고 화면 전체를 죽이는 것은 과하다. 대신 error 를
 *   올려보내 부모가 대체 UI 를 보이게 한다.
 *
 * [Usage]
 * ```tsx
 * const [status, setStatus] = useState<KakaoSdkStatus>("loading");
 * return <KakaoSdkScript onStatusChange={setStatus} />;
 * ```
 * ---------------------------------------------
 */

export type KakaoSdkStatus = "loading" | "ready" | "error";

/**
 * `libraries=services` 는 주소↔좌표 변환(Geocoder)을 함께 받는다. 나중에 주소
 * 검색을 붙일 때 URL 을 바꾸면 SDK 를 두 번 내려받게 되므로 처음부터 넣어 둔다.
 */
function sdkUrl(appKey: string): string {
  const params = new URLSearchParams({
    appkey: appKey,
    autoload: "false",
    libraries: "services",
  });

  return `https://dapi.kakao.com/v2/maps/sdk.js?${params.toString()}`;
}

interface KakaoSdkScriptProps {
  /** 단계가 바뀔 때마다 불린다. 보통 useState 의 setter 를 그대로 넘긴다. */
  onStatusChange: (status: KakaoSdkStatus) => void;
}

export function KakaoSdkScript({ onStatusChange }: KakaoSdkScriptProps) {
  // `process.env.NEXT_PUBLIC_...` 은 빌드 때 문자열로 통째 치환된다. 변수로
  // 동적으로 읽으면 치환이 일어나지 않으니 반드시 이 형태로 쓴다.
  const appKey = process.env.NEXT_PUBLIC_KAKAO_JAVA_API_KEY;

  // 렌더 도중에 부모 상태를 바꾸면 React 가 막는다. 그래서 효과로 미룬다.
  useEffect(() => {
    if (!appKey) {
      onStatusChange("error");
    }
  }, [appKey, onStatusChange]);

  if (!appKey) {
    return null;
  }

  return (
    <Script
      src={sdkUrl(appKey)}
      // 기본값이지만 명시한다. 지도는 첫 화면 페인트를 막을 만큼 급하지 않다.
      strategy="afterInteractive"
      onReady={() => {
        const sdk = window.kakao;
        if (!sdk) {
          onStatusChange("error");
          return;
        }

        // 2단계 초기화. 이미 끝났으면 콜백이 즉시 실행되므로 재마운트에도 안전하다.
        sdk.maps.load(() => onStatusChange("ready"));
      }}
      onError={() => onStatusChange("error")}
    />
  );
}