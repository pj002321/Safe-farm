"use client";

import Script from "next/script";
import { useState } from "react";

/**
 * ---------------------------------------------
 * [Feature]: Swagger UI 렌더링 (CDN 번들)
 *
 * [Description]
 * - swagger-ui-react 를 의존성으로 추가하는 대신 swagger-ui-dist CDN 번들을
 *   next/script 로 불러와 `/openapi.json` 을 그린다. 관리자만 보는 화면이라
 *   빌드 크기를 늘릴 이유가 없다.
 * ---------------------------------------------
 */
export function SwaggerViewer() {
  const [cssLoaded, setCssLoaded] = useState(false);

  return (
    <>
      <link
        rel="stylesheet"
        href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"
        onLoad={() => setCssLoaded(true)}
      />
      {cssLoaded && (
        <Script
          src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"
          strategy="afterInteractive"
          onReady={() => {
            // @ts-expect-error CDN 전역
            window.SwaggerUIBundle({
              url: "/openapi.json",
              dom_id: "#swagger-ui",
            });
          }}
        />
      )}
      <div id="swagger-ui" />
    </>
  );
}
