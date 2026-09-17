import { SkeletonLine, SkeletonScreen } from "@/components/shared/Skeleton";

/**
 * ---------------------------------------------
 * [Feature]: 밭 예보 한 줄이 도착하기 전 자리
 *
 * [Description]
 * - 예전에는 `SatelliteScan compact` 를 썼다. 그 연출은 **지도처럼 한 덩어리가
 *   통째로 늦게 오는 자리**에 맞는 것이고, 여기는 밭마다 줄이 하나씩 차오르는
 *   목록이다. 목록에 로딩 연출을 밭 수만큼 띄우면 화면이 번쩍이고, 도착한 순간
 *   64px 타일이 66px 줄로 바뀌면서 아래가 밀린다.
 * - 스켈레톤을 쓰는 이유는 **레이아웃이 튀지 않게** 하기 위해서다. 그래서 실제
 *   접힌 줄(`PlotForecastRow`)과 같은 모양·같은 높이를 잡는다:
 *   얼굴색 원(36px) · 이름 두 줄 · 오른쪽 기온 · 셰브런.
 *   ⚠️ 실제 줄이 66px 다(실측). 이 자리가 그보다 크거나 작으면 도착하는 순간
 *      목록이 움직인다 — 스켈레톤을 쓰는 의미가 사라진다.
 * - 알림 문구는 `SkeletonScreen` 이 한 번만 낸다. 조각마다 알리면 스크린리더가
 *   밭 수만큼 같은 말을 읽는다.
 *
 * [Usage]
 * ```tsx
 * <Suspense fallback={<PlotRowSkeleton nameKo="앞들 배추밭" />}>
 * ```
 * ---------------------------------------------
 */

export function PlotRowSkeleton({ nameKo }: { nameKo: string }) {
  return (
    <SkeletonScreen labelKo={`${nameKo} 예보를 불러오는 중입니다`}>
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
        {/* 얼굴색 원 자리. 실제와 같은 size-9 라 도착해도 안 밀린다. */}
        <SkeletonLine className="size-9 shrink-0 rounded-full" />

        {/* ⚠️ 이 칸 높이가 행 높이를 정한다. 실제 줄은 이름(text-base 24px) +
            작물(text-xs 16px) = 40px 라 `h-10` 으로 못 박는다. 조각 높이를 눈대중으로
            맞추면 62px 가 나와 도착하는 순간 4px 씩 밀린다(실측). */}
        <span className="flex h-10 min-w-0 flex-1 flex-col justify-center gap-1.5">
          <SkeletonLine className="h-4 w-28" />
          <SkeletonLine className="h-3 w-20" />
        </span>

        {/* 기온 자리. 실제가 text-xl 이라 그만큼 잡는다. */}
        <SkeletonLine className="h-6 w-16 shrink-0" />
        <SkeletonLine className="size-4 shrink-0" />
      </div>
    </SkeletonScreen>
  );
}
