import { toHazardAlert } from "@/features/dashboard/domain/hazardAlert";
import { selectPlot } from "@/features/plots/domain/plotSelection";
import { listPlots } from "@/features/plots/plotStore";
import { aiService } from "@/shared/aiService/client";
import { HazardBanner } from "./StatusBanners";

/**
 * ---------------------------------------------
 * [Feature]: 홈 최상단 기상특보 배너 — 실데이터 조회
 *
 * [Description]
 * - 예전에는 `SAMPLE_ALERT`(고정값)를 그렸다. 화면이 늘 "상주 가을가뭄"을
 *   말했고, 밭이 어디든 같은 값이었다.
 * - **특보는 배치로 만들어 두지 않고 화면이 볼 때 조회한다.** 특보는 지금
 *   발효 중인지가 전부라, 미리 만들어 두면 해제된 특보가 남고 새로 뜬 특보는
 *   다음 배치까지 안 보인다.
 * - `ForecastPanel` 과 **같은 호출**(`aiService.plotForecast`)을 쓴다. 같은 밭이면
 *   URL 이 같아 Next 의 Data Cache 가 한 번만 나간다 — 배너를 위해 따로 때리지
 *   않는다. 밭을 고르는 규칙도 `selectPlot` 으로 공유해서, 배너와 예보가 서로
 *   다른 밭을 말하는 일이 없게 한다.
 * - ⚠️ 이 컴포넌트는 **외부 호출을 기다린다.** 페이지에서 `<Suspense>` 로 감싸지
 *   않으면 홈 전체가 이 호출을 기다리게 된다. fallback 은 `null` 이다 — 특보는
 *   대개 없는 것이 정상이라, 자리를 잡아 두면 빈 칸이 깜빡인다.
 *
 * [Usage]
 * ```tsx
 * <Suspense fallback={null}>
 *   <HazardBannerSlot requestedPlotId={requestedPlotId} userId={profile.id} />
 * </Suspense>
 * ```
 * ---------------------------------------------
 */

export async function HazardBannerSlot({
  userId,
  requestedPlotId,
}: {
  userId: string;
  /** `?plot=` 로 들어온 값. 신뢰하지 않고 내 밭 목록에서 찾아 확인한다. */
  requestedPlotId?: string;
}) {
  let plots: Awaited<ReturnType<typeof listPlots>> = [];
  try {
    plots = await listPlots(userId);
  } catch (error) {
    // `<Suspense>` 는 던지는 것을 잡지 않는다. 여기서 막지 않으면 밭 목록 조회가
    // 실패하는 순간 홈이 통째로 오류 화면이 된다(ForecastPanel 과 같은 이유).
    console.error("[dashboard] 특보용 밭 목록 조회 실패", error);
    return null;
  }

  const selected = selectPlot(plots, requestedPlotId);
  if (!selected) return null;

  const result = await aiService.plotForecast(
    selected.latitude,
    selected.longitude,
    { id: selected.id, userId },
  );

  if (!result.ok) {
    // 배너 자리에 오류 문구를 띄우지 않는다. **같은 호출**을 쓰는 예보 칸이 이미
    // 눈에 보이는 실패 안내를 내므로, 화면 맨 위에 같은 말을 한 번 더 쌓으면
    // 정작 봐야 할 할 일이 접힌 곳 아래로 밀린다. 원인은 로그에 남긴다.
    console.error("[dashboard] 특보 조회 실패", result.reason, result.detail);
    return null;
  }

  return (
    <HazardBanner alert={toHazardAlert(result.data.alert, selected.nameKo)} />
  );
}
