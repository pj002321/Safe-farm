import {
  SkeletonCard,
  SkeletonLine,
  SkeletonScreen,
} from "@/components/shared/Skeleton";

/**
 * ---------------------------------------------
 * [Feature]: (app) 구간 로딩 스켈레톤
 *
 * [Description]
 * - 이 구간의 화면들이 서버에서 준비되는 동안 보인다(Next 가 Suspense 경계를
 *   자동으로 건다).
 * - 대시보드 모양을 본떴다. 실제 화면과 닮지 않은 스켈레톤은 기다림을 길게
 *   느끼게 하고, 내용이 도착할 때 레이아웃이 튄다.
 * ---------------------------------------------
 */
export default function AppLoading() {
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-7 px-6 py-6 sm:py-8">
      <SkeletonScreen labelKo="화면을 불러오는 중입니다">
        <SkeletonLine className="h-10 w-full rounded-lg" />

        <div className="mt-7">
          <SkeletonLine className="h-7 w-40" />
          <SkeletonLine className="mt-2 h-4 w-72" />
        </div>

        {/* 텃밭 가로 스크롤 자리 */}
        <div className="mt-7 flex gap-3 overflow-hidden">
          <SkeletonLine className="h-[8.5rem] w-[15.5rem] shrink-0 rounded-lg" />
          <SkeletonLine className="h-[8.5rem] w-[15.5rem] shrink-0 rounded-lg" />
          <SkeletonLine className="h-[8.5rem] w-[11rem] shrink-0 rounded-lg" />
        </div>

        {/* 할 일 + 예보 자리 */}
        <div className="mt-7 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:gap-8">
          <div className="flex flex-col gap-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <div className="flex flex-col gap-3">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      </SkeletonScreen>
    </main>
  );
}
