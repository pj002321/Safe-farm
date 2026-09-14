import type { NextRequest } from "next/server";
import { updateSession } from "@/shared/auth/proxySession";

/**
 * Next 16에서 `middleware.ts` → `proxy.ts` 로 이름이 바뀌었다.
 * src/ 를 쓰므로 이 파일은 src/ 안에 있어야 한다.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

/**
 * 인증 검사를 태울 경로.
 *
 * ⚠️ **`public/` 의 정적 파일은 반드시 전부 빠져야 한다.** 확장자 목록이 모자라면
 * 그 파일은 미들웨어를 타고, 세션이 없으므로 `/login` 으로 307 리다이렉트된다.
 * 브라우저는 JS 를 기대한 자리에서 HTML 을 받아 `Unexpected token '<'` 로 죽는다.
 * (실제로 `theme-init.js` 가 이 함정에 빠졌다 — 이미지 확장자만 제외돼 있었다.)
 *
 * 라우트는 확장자를 갖지 않으므로 아래 목록에 라우트가 잘못 걸릴 일은 없다.
 * `public/` 에 새 형식을 추가하면 여기에도 확장자를 더할 것.
 *
 * 확장자 목록을 상수로 빼서 조립하지 않는다. Next 는 matcher 가 **정적으로 분석
 * 가능한 리터럴**이기를 요구해서, 템플릿 문자열로 만들면 빌드가 거부한다.
 * 그래서 길어도 한 줄 리터럴로 둔다.
 *
 * 목록: 이미지(svg png jpg jpeg gif webp avif ico) · 스크립트/스타일(js mjs css map)
 *      · 폰트(woff woff2 ttf otf) · 문서/메타(json txt xml webmanifest pdf)
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|js|mjs|css|map|woff|woff2|ttf|otf|json|txt|xml|webmanifest|pdf)$).*)",
  ],
};
