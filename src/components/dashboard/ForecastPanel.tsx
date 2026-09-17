import { after } from "next/server";
import { SatelliteScan } from "@/components/shared/SatelliteScan";
import { selectPlot } from "@/features/plots/domain/plotSelection";
import { listPlots } from "@/features/plots/plotStore";
import { splitWeek } from "@/features/weather/domain/weekSplit";
import { aiService } from "@/shared/aiService/client";
import { PlotSelect } from "./PlotSelect";
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
 * - **화면은 고른 밭 하나만 기다린다.** 나머지 밭은 응답을 보낸 뒤(`after`) 병렬로
 *   데워 둔다 — 1시간 캐시라 밭을 바꿀 때 ai-service 를 새로 안 때린다.
 *   기다리는 것과 데우는 것을 나눈 이유는 아래 ⚠️ 에 적었다.
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

  /**
   * 화면이 기다리는 것은 **고른 밭 하나뿐**이다.
   *
   * ⚠️ 전에 `Promise.all` 로 모든 밭을 await 했다가 되돌렸다. `plotForecast` 는
   *    던지지 않고 값을 돌려주므로 Promise.all 이 **전부 끝날 때까지** 기다리는데,
   *    그러면 밭 하나가 느린 날 고른 밭 예보가 캐시에 있어도 화면이 같이 멈춘다.
   *    같은 함정을 `/weather` 가 이미 밟고 고쳤다 — 그 파일에 "하나로 묶으면 가장
   *    느린 밭이 나머지를 붙잡아"라고 적혀 있는데 그걸 여기서 다시 냈다.
   */
  const result = await aiService.plotForecast(
    selected.latitude,
    selected.longitude,
    selected.id,
  );

  /**
   * 나머지 밭은 **응답을 막지 않고** 데운다.
   *
   * 예보는 1시간 캐시라, 지금 받아 두면 셀렉트로 밭을 바꿀 때 ai-service 를 새로
   * 때리지 않는다 — 전환이 캐시에서 바로 나온다.
   * `after` 를 쓰는 이유: 렌더 안에서 await 하지 않고 띄워만 두면 응답이 끝나면서
   * 잘릴 수 있다. `after` 는 응답을 보낸 **뒤에** 실행을 보장한다.
   */
  after(async () => {
    await Promise.all(
      plots
        .filter((plot) => plot.id !== selected.id)
        .map((plot) =>
          aiService.plotForecast(plot.latitude, plot.longitude, plot.id),
        ),
    );
  });

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
    <WorkWindow
      picker={<PlotSelect plots={plots} selectedId={selected.id} />}
      weekdays={weekdays}
      weekend={weekend}
    />
  );
}
