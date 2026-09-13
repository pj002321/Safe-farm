import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import { ThemeScript } from "@/components/shared/ThemeScript";
import { siteUrl } from "@/shared/config/site";
import "./globals.css";

/**
 * ---------------------------------------------
 * [Feature]: 루트 레이아웃 (폰트 · 메타데이터 · 테마 부트스트랩)
 *
 * [Description]
 * - 모든 페이지가 통과하는 유일한 껍데기. 여기서 하는 일은 셋뿐이다:
 *   폰트 변수 주입, 메타데이터 선언, 첫 페인트 전 테마 확정.
 * - metadataBase 를 **비워 두지 않는다.** 비우면 Next 가 상대 경로 OG/canonical 을
 *   `http://localhost:3000` 기준으로 해석하고 빌드마다 경고를 낸다. 도메인을
 *   하드코딩하지 않기 위해 `siteUrl()` 로 환경에서 읽는다 —
 *   로컬 / Firebase Hosting 기본 도메인 / 커스텀 도메인이 각각 다른 값을 준다.
 *
 * [Usage]
 * ```tsx
 * // app/ 하위 모든 라우트가 자동으로 감싸진다. 직접 import 하지 않는다.
 * ```
 * ---------------------------------------------
 */

/** 제목·설명은 og/twitter 와 어긋나면 안 되므로 한 곳에서만 정의한다. */
const SITE_TITLE = "Safe Farm AI — 위성이 보는 땅, AI가 읽는 내일";
const SITE_DESCRIPTION =
  "인공위성 관측과 기상 예보를 결합해 농작물 생육 상태와 자연재해 위험을 매일 알려드립니다.";

/**
 * 링크 미리보기 이미지(카카오톡·슬랙·X 등).
 *
 * `public/og.png` 는 `docs/thumbnail.html` 을 헤드리스 크롬으로 뽑은 결과다.
 * 디자인을 고치려면 그 HTML 을 고쳐서 다시 뽑는다 — 이 PNG 를 직접 손대지 말 것.
 *
 * 경로를 상대("/og.png")로 두는 이유는 metadataBase 가 환경별 절대 주소를
 * 붙여 주기 때문이다. 여기에 절대 주소를 박으면 로컬·프리뷰에서도 운영 이미지를
 * 가리키게 된다.
 *
 * width/height 를 명시하는 건 장식이 아니다. 카카오톡·슬랙 크롤러는 이미지를
 * 내려받기 전에 이 값으로 레이아웃을 잡는데, 없으면 미리보기가 작은 썸네일로
 * 찌그러지거나 아예 안 뜬다.
 */
const OG_IMAGE = {
  url: "/og.png",
  width: 1280,
  height: 640,
  alt: SITE_TITLE,
} as const;

/**
 * 계측값·좌표·시각에 쓰는 고정폭 폰트. className 이 아니라 variable 로 받아서
 * globals.css 의 --font-mono 가 소비한다(= font-mono 유틸리티 한 곳으로 통일).
 */
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: SITE_TITLE,
    template: "%s · Safe Farm AI",
  },
  description: SITE_DESCRIPTION,
  metadataBase: siteUrl(),
  keywords: [
    "인공위성",
    "위성 영상",
    "농작물 생육",
    "재배 적합도",
    "자연재해 위험",
    "기상 예보",
    "정밀농업",
    "스마트팜",
  ],
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "Safe Farm AI",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
  },
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: ThemeScript 가 하이드레이션 전에 data-theme 을
    // 바꾸므로 서버 HTML 과 속성이 달라진다. 이 태그 하나에만 필요하다.
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/*
          한글 본문은 Pretendard 를 CDN 으로 받는다. next/font/google 의 한글
          서브셋은 글리프 누락과 용량이 들쭉날쭉해 신뢰할 수 없어서,
          자간·자소가 검증된 dynamic-subset 배포본을 쓴다. globals.css 의
          --font-sans 가 "Pretendard Variable" 을 1순위로 두고 시스템 폰트로
          폴백하므로, 이 CDN 이 죽어도 화면은 읽힌다.
        */}
        <link
          rel="preconnect"
          href="https://cdn.jsdelivr.net"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        <ThemeScript />
      </head>
      <body className={`${geistMono.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
