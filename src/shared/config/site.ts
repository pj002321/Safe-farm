/**
 * ---------------------------------------------
 * [Feature]: 배포 환경별 사이트 URL 해석
 *
 * [Description]
 * - 우리 앱의 절대 주소가 필요한 곳이 있다(OG 태그의 `metadataBase`, 메일 링크).
 *   로컬과 배포가 다르므로 한 값으로 박을 수 없다.
 * - 우선순위:
 *   1. `NEXT_PUBLIC_SITE_URL` — 커스텀 도메인을 붙였으면 그게 정답이다.
 *   2. Firebase 프로젝트 ID 로 유추한 `https://<projectId>.web.app`.
 *      Firebase Hosting 이 프로젝트마다 주는 기본 도메인이라 별도 설정이 필요 없다.
 *   3. 로컬 폴백.
 * - **OAuth 나 세션 쿠키에는 이 함수를 쓰지 않는다.** 인증은 브라우저가 실제로
 *   접속한 오리진에서 일어나야 하고(Firebase 는 승인된 도메인 목록으로 검사한다),
 *   여기서 유추한 주소를 끼워 넣으면 로컬에서만 되는 설정이 만들어진다.
 *
 * [Usage]
 * ```ts
 * export const metadata: Metadata = { metadataBase: siteUrl() };
 * ```
 * ---------------------------------------------
 */

/**
 * `resolveSiteUrl` 이 보는 환경변수.
 *
 * 인덱스 시그니처가 필요하다. 선택 속성만 가진 타입은 TS 의 weak type 검사에
 * 걸려 `process.env`(ProcessEnv)를 그대로 넘길 수 없다.
 */
export interface SiteEnv {
  NEXT_PUBLIC_SITE_URL?: string;
  NEXT_PUBLIC_FIREBASE_PROJECT_ID?: string;
  PORT?: string;
  [key: string]: string | undefined;
}

/** 순수 함수. 환경변수를 받아 절대 URL 을 만든다. */
export function resolveSiteUrl(env: SiteEnv): URL {
  if (env.NEXT_PUBLIC_SITE_URL) {
    return new URL(env.NEXT_PUBLIC_SITE_URL);
  }

  if (env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
    return new URL(`https://${env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.web.app`);
  }

  return new URL(`http://localhost:${env.PORT ?? "3000"}`);
}

/** 현재 프로세스 기준 사이트 URL. */
export function siteUrl(): URL {
  return resolveSiteUrl(process.env);
}
