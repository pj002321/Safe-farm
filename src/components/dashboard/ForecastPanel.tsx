import { SatelliteScan } from "@/components/shared/SatelliteScan";
import { selectPlot } from "@/features/plots/domain/plotSelection";
import { listPlots } from "@/features/plots/plotStore";
import { splitWeek } from "@/features/weather/domain/weekSplit";
import { aiService } from "@/shared/aiService/client";
import { PlotPicker } from "./PlotPicker";
import { WorkWindow } from "./WorkWindow";

/**
 * ---------------------------------------------
 * [Feature]: 홈 날씨 칸 — 밭 선택 + 평일/주말 작업 가능 여부
 *
 * [Description]
 * - 예전에는 `SAMPLE_WEEKEND`(고정값)를 그렸다. 날짜가 `9/19`·`9/20` 으로 박혀
 *   있어서 화면이 늘 같은 주말을 말했고, 밭이 어디든 같은 값이었다.
 *   지금은 `/weather` 와 **같은 호출**(`aiService.plotForecast`)을 쓴다.
 * - **기본값은 가장 최근에 만든 밭**이다. `listPlots` 가 `created_at` 내림차순이라
 *   `plots[0]` 이 곧 그 밭이다 — 방금 등록한 밭을 홈에서 바로 보게 된다.
 * - `?plot=` 로 고른 밭이 목록에 없으면(지운 밭, 남의 밭 id) 조용히 기본값으로
 *   돌아간다. **오류를 내지 않는다** — 쿼리는 사용자가 고칠 수 있는 값이라
 *   그걸로 화면을 죽이면 안 된다.
 * - 예보 호출은 1시간 캐시다(`plotForecast`). 밭을 오가며 눌러도 같은 밭은 다시
 *   부르지 않는다.
 * - 실패하면 이 칸만 안내로 바뀐다. 홈의 나머지(할 일·텃밭)는 그대로 뜬다.
 *   ⚠️ 그건 `<Suspense>` 덕이 **아니다** — Suspense 는 기다림을 다루지 던지는 것을
 *      잡지 않는다. 아래에서 조회와 호출을 각각 직접 막기 때문이다.
 * ---------------------------------------------
 */

export function ForecastFallback() {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <SatelliteScan compact labelKo="밭 예보를 읽는 중" />
    </div>
  );
}

export async function ForecastPanel({
  userId,
  requestedPlotId,
}: {
  userId: string;
  /** `?plot=` 로 들어온 값. 신뢰하지 않고 내 밭 목록에서 찾아 확인한다. */
  requestedPlotId?: string;
}) {
  // ⚠️ `<Suspense>` 는 **던지는 것을 잡지 않는다.** 감싸지 않으면 밭 목록 조회가
  //    실패하는 순간 (app) 경계가 받아서 홈이 통째로 오류 화면이 된다 — 바로 위
  //    문단에서 "이 칸만 바뀐다"고 약속한 것과 반대다. 대시보드 페이지가 같은
  //    테이블을 같은 이유로 이미 감싸고 있다.
  let plots: Awaited<ReturnType<typeof listPlots>> = [];
  try {
    plots = await listPlots(userId);
  } catch (error) {
    console.error("[dashboard] 예보용 밭 목록 조회 실패", error);
    return (
      <div className="rounded-lg border border-border border-dashed bg-surface-2/40 p-4 text-fg-muted text-sm">
        밭 목록을 불러오지 못해 예보를 낼 수 없습니다. 잠시 후 다시
        확인해주세요.
      </div>
    );
  }
  // 고르는 규칙은 `selectPlot` 에 있다. 특보 배너가 같은 규칙을 써야 해서
  // 한 곳에 뒀다 — 각자 고르면 어느 날 배너와 예보가 다른 밭을 말하게 된다.
  const selected = selectPlot(plots, requestedPlotId);
  if (!selected) return null;

  const result = await aiService.plotForecast(
    selected.latitude,
    selected.longitude,
    selected.id,
  );

  if (!result.ok) {
    return (
      <div className="rounded-lg border border-border border-dashed bg-surface-2/40 p-4 text-fg-muted text-sm">
        <span className="font-semibold text-fg">
          {selected.nameKo ?? "이름 없는 밭"}
        </span>{" "}
        예보를 지금 불러오지 못했습니다. 잠시 후 다시 확인해주세요.
      </div>
    );
  }

  const { weekdays, weekend } = splitWeek(
    result.data.days,
    result.data.cropImpact,
  );

  return (
    <>
      <PlotPicker plots={plots} selectedId={selected.id} />
      <WorkWindow weekdays={weekdays} weekend={weekend} />
    </>
  );
}
