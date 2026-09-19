import { SproutIcon } from "@/components/icons";
import { listCropOptions } from "@/features/crops/cropStore";
import {
  pickBannerItem,
  toBannerLine,
  toSowingLine,
  toVegetationItem,
} from "@/features/dashboard/domain/vegetationBanner";
import {
  findCalendarByNameKo,
  stageAt,
} from "@/features/growth/domain/growthStage";
import type { PlotMapPoint } from "@/features/plots/domain/plotSummary";
import { daysSincePlanting } from "@/features/plots/domain/plotSummary";
import { listPlots } from "@/features/plots/plotStore";
import { aiService } from "@/shared/aiService/client";
import { kstDateString } from "@/shared/utils/kstDate";
import { DeviationBanner } from "./StatusBanners";

/**
 * ---------------------------------------------
 * [Feature]: 홈 텃밭 섹션 아래 생육 배너 — 실데이터 조회
 *
 * [Description]
 * - 예전에는 `SAMPLE_DEVIATION`(고정값)을 그렸다. 배추를 심지 않은 사용자에게도
 *   **"배추밭 생육이 인근 평균보다 6일 느립니다"** 가 그대로 나갔다.
 * - `HazardBannerSlot` 과 같은 얼개다(조회 실패를 삼키고 `<Suspense>` 로 감싼다).
 * - **한 줄만 그린다.** 무엇을 그릴지는 두 갈래다 —
 *
 *       🛰 급한 밭이 있으면   "설화고 · 밭 위치가 맞는지 확인해 주세요. · 09-08 위성 관측"
 *       🌱 없으면            "9월에 흔히 심는 것 — 시금치 · 양파 · 고사리. …"
 *
 *   고르는 규칙은 `features/dashboard/domain/vegetationBanner` 에 있다.
 *   **급하지 않은 위성 소식은 안 그린다** — "잎이 빽빽해요" 는 좋은 소식이라
 *   한 줄을 차지할 값어치가 없다.
 *
 * - 밭을 훑을 때 날씨 탭과 **같은 호출**(`satelliteObservations`)을 같은 날짜
 *   범위로 쓴다. URL 이 같아 Next 의 Data Cache 가 이미 받아 둔 것은 안 나간다.
 *
 * ⚠ **"6일 느립니다" 는 못 만든다.** 그 말은 올해 NDVI 곡선을 **기준 곡선**과
 *   견줘야 나오는데, 지금 있는 것은 올해 한 구간뿐이라 견줄 대상이 없다.
 *   지어낸 숫자를 적느니, 확인이 필요한 밭만 짚고 나머지 날은 심을 것을 알린다.
 *
 * ⚠ **단계를 같이 본다.** 익어 가는 밭은 잎이 마르는 게 정상이라, 모르고
 *   지나가면 추수 앞둔 논에 "물기가 줄었어요" 가 그대로 나간다. 단계는 이미
 *   받아 둔 밭 목록으로 내므로 조회가 늘지 않는다(`stageKoOf`).
 *
 * ⚠ 이 컴포넌트는 **외부 호출을 기다린다.** `<Suspense>` 로 감싸지 않으면 홈
 *   전체가 이 호출을 기다린다. fallback 은 `null` — 관측이 없는 것이 흔한
 *   정상이라 자리를 잡아 두면 빈 칸이 깜빡인다.
 *
 * [Usage]
 * ```tsx
 * <Suspense fallback={null}>
 *   <VegetationBannerSlot userId={profile.id} />
 * </Suspense>
 * ```
 * ---------------------------------------------
 */

/**
 * 되돌아보는 날수. 날씨 탭의 `SATELLITE_WINDOW_DAYS` 와 **같은 값이어야 한다** —
 * 어긋나면 URL 이 달라져 같은 밭인데 호출이 두 번 나간다.
 */
const WINDOW_DAYS = 90;

/**
 * 이 밭의 현재 생육단계 이름. 모르면 null.
 *
 * ⚠ 홈 페이지의 `stageKoOf` 와 **같은 계산**이다(page.tsx). 거기 있는 것은 파일
 *   안에 갇힌 지역 함수라 가져다 쓸 수 없었다 — 같은 달력·같은 헬퍼를 쓰므로
 *   값은 같다. 한쪽이 바뀌면 다른 쪽도 봐야 한다.
 *
 * 단계를 아는 까닭은 하나다. **익어 가는 밭은 잎이 마르는 게 정상**이라,
 * 모르고 지나가면 추수 앞둔 논에 "물기가 줄었어요" 가 그대로 나간다.
 */
function stageKoOf(plot: PlotMapPoint, now: Date): string | null {
  const calendar = findCalendarByNameKo(
    plot.cultivations[0]?.cropNameKo ?? null,
  );
  const days = daysSincePlanting(plot, now);
  if (!calendar || days === null) return null;
  return stageAt(calendar, days).nameKo;
}

export async function VegetationBannerSlot({ userId }: { userId: string }) {
  let plots: Awaited<ReturnType<typeof listPlots>> = [];
  try {
    plots = await listPlots(userId);
  } catch (error) {
    // `<Suspense>` 는 던지는 것을 잡지 않는다. 여기서 막지 않으면 밭 목록 조회가
    // 실패하는 순간 홈이 통째로 오류 화면이 된다(HazardBannerSlot 과 같은 이유).
    console.error("[dashboard] 생육 배너용 밭 목록 조회 실패", error);
    return null;
  }

  // ⚠ **기르는 밭만 본다.** 빈 밭까지 훑으면 호출이 밭 수만큼 나간다 —
  //   실측으로 밭 21개 중 관측이 있는 것은 5개뿐이었다.
  const 기르는밭 = plots.filter((p) => p.cultivations.length > 0);
  if (기르는밭.length === 0) return null;

  const today = kstDateString();
  const from = kstDateString(new Date(Date.now() - WINDOW_DAYS * 86_400_000));

  // ⚠ **한국 날짜로 센다.** `new Date()` 를 그대로 쓰면 운영 서버(UTC)에서
  //   한국 시각 0~9시에 **어제**가 된다 — 9월 1일 아침에 "8월에 흔히 심는 것"
  //   이 뜨고, 날짜로 돌아가는 줄도 아홉 시간 어긋난 자리에서 바뀐다.
  const 오늘 = new Date(`${today}T00:00:00Z`);

  // 밭끼리 서로를 기다릴 이유가 없다. 날씨 탭과 **같은 URL** 이라 Next 의
  // Data Cache 가 이미 받아 둔 것은 다시 안 나간다.
  const 결과들 = await Promise.all(
    기르는밭.map((plot) =>
      aiService.satelliteObservations(
        plot.latitude,
        plot.longitude,
        from,
        today,
      ),
    ),
  );

  const items = 기르는밭
    .map((plot, i) => {
      const r = 결과들[i];
      if (!r?.ok) return null;
      return toVegetationItem({
        plotNameKo: plot.nameKo,
        points: r.data.points,
        stageNameKo: stageKoOf(plot, 오늘),
      });
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const 급한줄 = pickBannerItem(items, 오늘);
  if (급한줄) {
    return <DeviationBanner deviationKo={toBannerLine(급한줄)} />;
  }

  // 급한 것이 없는 날. 위성 대신 이 달에 심는 것을 보인다 —
  // "잎이 빽빽해요" 는 좋은 소식이라 한 줄을 차지할 값어치가 없다.
  //
  // ⚠ `getMonth()` 가 아니라 `getUTCMonth()` 다. 위에서 UTC 자정으로 만든 날짜라,
  //   로컬이 UTC 보다 뒤인 곳에서는 매달 1일에 **지난달**이 된다. KST 로 맞추려다
  //   시간대를 하나 더 끼워 넣은 자리다.
  return <SowingBanner month={오늘.getUTCMonth() + 1} />;
}

/**
 * 이 달에 흔히 심는 작물 한 줄. 심을 것이 없으면 아무것도 안 그린다.
 *
 * ⚠ 밭과 무관한 값이라 **사용자가 누구든 같은 답**이다. 조회가 하나 늘지만
 *   그만큼 캐시가 잘 듣는다.
 */
async function SowingBanner({ month }: { month: number }) {
  let crops: Awaited<ReturnType<typeof listCropOptions>> = [];
  try {
    crops = await listCropOptions();
  } catch (error) {
    console.error("[dashboard] 파종 작물 조회 실패", error);
    return null;
  }

  const 말 = toSowingLine(
    crops.filter((c) => c.sowingNow).map((c) => c.nameKo),
    month,
  );
  if (!말) return null;

  return <SowingLine textKo={말} />;
}

/**
 * 새싹 아이콘 한 줄. `DeviationBanner`(위성)와 **같은 결·다른 아이콘**이다.
 *
 * ⚠ 저 컴포넌트를 고쳐 아이콘을 받게 하지 않았다. 남의 파일이라 손대는 대신
 *   같은 여백·같은 색으로 여기 둔다. 둘 중 하나의 모양이 바뀌면 같이 봐야 한다.
 */
function SowingLine({ textKo }: { textKo: string }) {
  return (
    <p className="flex items-start gap-2 rounded-md bg-info/10 px-3.5 py-2 text-[0.8rem] text-fg-muted leading-relaxed">
      <SproutIcon className="mt-0.5 size-4 shrink-0 text-info" />
      {textKo}
    </p>
  );
}
