import { CallToAction } from "@/components/landing/CallToAction";
import { CoordinateProof } from "@/components/landing/CoordinateProof";
import { DataSources } from "@/components/landing/DataSources";
import { Hero } from "@/components/landing/Hero";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingNav } from "@/components/landing/LandingNav";
import { PlotComparison } from "@/components/landing/PlotComparison";
import { PlotKinds } from "@/components/landing/PlotKinds";
import { SatelliteView } from "@/components/landing/SatelliteView";
import { TodayInSangju } from "@/components/landing/TodayInSangju";

/**
 * ---------------------------------------------
 * [Feature]: 공개 랜딩 페이지  →  /
 *
 * [Description]
 * - 라우트 그룹 밖에 둔다. `(app)` 셸(로그인 사용자용 헤더)을 씌우지 않기 위해서다.
 *   로그인한 사용자의 홈은 `/dashboard` 이고, 이 페이지는 비로그인도 본다
 *   (`shared/auth/proxySession.ts` 의 `PUBLIC_EXACT` 에 `"/"` 가 들어 있다).
 * - 이 파일은 **조립만** 한다. 섹션의 내용·상태·데이터는 각 컴포넌트가 가진다.
 * - 순서가 곧 서사다. 능력을 자랑하는 순서가 아니라 **의심을 푸는 순서**로 놓았다:
 *   어디에 있나(Hero) → 무엇으로 보나(#eyes) → 어떻게 재나(#plots) →
 *   실제로 보인 것(#sat) → 틀리면 이렇게 된다(#proof) → 내 밭은 어떤가(#my) →
 *   오늘은(#today). 한계를 드러내는 #proof 가 자랑(#sat) 바로 뒤에 오는 것이
 *   이 페이지의 핵심이다. 순서를 바꾸면 정직함이 마케팅으로 읽힌다.
 * - 배경 리듬: 섹션이 일곱이라 전부 같은 바탕이면 스크롤이 한 덩어리로 뭉갠다.
 *   한 칸 걸러 `bg-surface-2` 띠를 준다. `#plots` 와 `#proof` 는 컴포넌트가 스스로
 *   띠를 가지므로 여기서는 `#today` 만 감싼다. 섹션 내부를 고치지 않고 바깥에서
 *   리듬만 얹기 위해 래퍼 `div` 를 쓴다.
 * - 서버 컴포넌트다. 상호작용이 필요한 섹션만 각자 "use client" 를 선언하므로
 *   클라이언트 번들에는 Hero·Nav 와 상호작용 섹션만 들어간다.
 * ---------------------------------------------
 */
export default function LandingPage() {
  return (
    <>
      <LandingNav />
      <main>
        <Hero />
        <DataSources />
        <PlotKinds />
        <SatelliteView />
        <CoordinateProof />
        <PlotComparison />
        <div className="bg-surface-2">
          <TodayInSangju />

          <CallToAction />
        </div>
      </main>
      <LandingFooter />
    </>
  );
}
