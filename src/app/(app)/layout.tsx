import Link from "next/link";
import { LogoWordmark } from "@/components/icons";
import { BottomTabs } from "@/components/shared/BottomTabs";
import { BOTTOM_TABS_SPACER } from "@/components/shared/bottomTabsLayout";
import { HeaderTabs } from "@/components/shared/HeaderTabs";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { requireConsentOrRedirect } from "@/shared/auth/consentGate";

/**
 * ---------------------------------------------
 * [Feature]: 사용자 셸 + 역할별 네비 분기
 *
 * [Description]
 * - 관리자에게만 `/admin` 링크를 보여준다. **이건 UX일 뿐 보안이 아니다** —
 *   링크를 숨겨도 URL을 직접 치면 들어온다. 실제 차단은 (admin)/layout.tsx 가 한다.
 * - 로고는 `/dashboard` 로 간다. `/` 는 공개 랜딩이라, 로그인한 사용자가 로고를
 *   누를 때마다 마케팅 페이지로 튕겨 나가면 안 된다.
 * - **동의 게이트가 여기 있다.** 약관 동의가 없는 사용자는 앱 화면을 보기 전에
 *   `/onboarding/consent` 로 간다. 구글은 로그인과 가입을 구분하지 않아서
 *   동의 화면을 거치지 않고 만들어진 계정이 생기기 때문이다.
 *   ⚠️ 렌더 시점 검사라 **Server Action 에는 미치지 않는다.** 동의가 전제인
 *   액션은 첫 줄에서 `requireConsent()` 를 부를 것.
 * - **주요 메뉴가 화면 크기에 따라 자리를 옮긴다.** 좁으면 하단 독, 넓으면 헤더
 *   가운데 세그먼트 탭이다. 목록은 `appTabs.tsx` 한 곳에서 오므로 둘이 어긋나지
 *   않는다. 예전에는 넓은 화면에 주요 메뉴가 **아예 없어서** 지도·날씨·질문·
 *   내정보로 갈 길이 데스크톱에서 끊겨 있었다.
 *   모바일 우선 구조라 주요 이동은 엄지가 닿는 아래쪽에 둔다. 넓은 화면에서는
 *   헤더가 그 일을 하므로 독을 숨긴다 —
 *   둘을 같이 두면 같은 이동을 두 군데서 제공해 현재 위치가 흐려진다.
 *   본문 아래 여백(`BOTTOM_TABS_SPACER`)을 빠뜨리면 페이지 마지막 요소가
 *   탭에 가려 영영 안 보인다.
 * - 헤더를 sticky 로 둔 건 관제 화면의 기본기다. 긴 관측 목록을 스크롤하는 동안
 *   현재 계정과 테마 조작이 화면에서 사라지면 안 된다. 반투명 + backdrop-blur 로
 *   아래 내용이 비쳐 보이게 해서 층이 하나 더 얹혔다는 걸 알린다.
 * ---------------------------------------------
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  // 로그인 · 동의를 한 번에 본다. 둘 중 하나라도 없으면 여기서 보내진다.
  const { viewer } = await requireConsentOrRedirect();

  return (
    <div className={`group/app min-h-dvh ${BOTTOM_TABS_SPACER}`}>
      <header className="sticky top-0 z-40 border-border border-b bg-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-3">
          <Link
            href="/dashboard"
            className="text-fg transition-colors hover:text-accent"
          >
            <LogoWordmark />
          </Link>

          <span className="flex-1" />

          {/* 넓은 화면의 주요 메뉴. 좁은 화면에서는 하단 독이 대신한다. */}
          <HeaderTabs />

          <span className="flex-1" />

          {viewer.isAdmin && (
            <Link
              href="/admin"
              className="text-earth text-sm transition-colors hover:text-fg"
            >
              관리자
            </Link>
          )}

          {/* 계정은 보조 정보다. 좁은 화면에서는 접어서 로고·테마에 자리를 내준다. */}
          <span className="hidden text-fg-muted text-sm sm:inline">
            {viewer.email}
          </span>

          <ThemeToggle />
        </div>
      </header>
      {children}

      {/*
        페이지가 **자기 전용 하단 독**을 띄우면 공용 독이 비켜선다(텃밭 등록 마법사가
        그렇게 한다). 안 비키면 좁은 화면 아래에 막대가 둘 쌓인다.

        ⚠️ 이 조건을 `BottomTabs` **안에** 넣지 않는다. 의존성은 한 방향이고
           (shared → features → app) 공용 컴포넌트가 특정 기능의 id 를 알면 그 규칙이
           뒤집힌다. 아는 쪽은 **여기**(app 층)여야 한다.
        ⚠️ display 유틸리티를 겨루게 하지 말 것. `hidden` 과 `group-has-[…]:hidden` 은
           둘 다 display:none 이라 안전하지만, 조건이 서로 다른 group-has 두 개를
           한 요소에 붙이면 특이도가 같아 **Tailwind 의 정렬 순서**가 승자를 정한다
           — 클래스를 적은 순서가 아니다.
      */}
      <div className="group-has-[#plot-dock]/app:hidden">
        <BottomTabs />
      </div>
    </div>
  );
}
