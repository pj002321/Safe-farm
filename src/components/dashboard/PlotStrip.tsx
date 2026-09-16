import Link from "next/link";
import { FieldIcon, MapPinIcon, SproutIcon } from "@/components/icons";
import { CROPS } from "@/components/plot/CropChips";
import { Badge } from "@/components/shared/Badge";
import { ButtonLink } from "@/components/shared/Button";
import { CROP_CALENDARS, stageAt } from "@/features/growth/domain/growthStage";
import type { PlotCard } from "@/features/plots/domain/plotSummary";
import { daysSincePlanting } from "@/features/plots/domain/plotSummary";

/**
 * ---------------------------------------------
 * [Feature]: 텃밭 요약 가로 스크롤 + 등록 진입점 (마크업 전용)
 *
 * [Description]
 * - 등록된 텃밭을 D+n 과 생육단계 배지로 요약해 가로로 흘린다(스펙).
 * - 값은 **실제 조회**(`listPlotCards`)에서 온다. 생육단계와 경과일은 파종일과
 *   `CROP_CALENDARS` 로 여기서 계산한다 — 고정 데이터 시절에는 완성된 문자열이
 *   들어왔지만, 그 문자열을 만들 사람이 필요해졌다.
 *   세로 목록이 아닌 이유는 밭이 늘어도 "오늘 할 일"이 화면 아래로 밀리지
 *   않게 하려는 것이다.
 * - 가로 스크롤은 **컨테이너 안에서만** 일어난다. `overflow-x-auto` 를 이 줄에
 *   가두지 않으면 페이지 전체가 좌우로 흔들린다.
 * - 마지막 칸이 **텃밭 등록 카드**다. 별도 버튼만 두면 밭이 늘어났을 때 어디서
 *   추가하는지 매번 찾아야 한다. 목록의 끝이 곧 "여기서 더한다"가 되게 한다.
 * - 밭이 하나도 없을 때는 카드 줄 대신 **온보딩 유도**를 그린다(스펙의 빈 상태).
 *   빈 가로 스크롤은 화면이 고장 난 것처럼 보인다.
 *
 * [Usage]
 * ```tsx
 * <PlotStrip plots={await listPlotCards(userId)} />
 * <PlotStrip plots={[]} />        // 온보딩 유도
 * ```
 * ---------------------------------------------
 */

/** 텃밭 등록 온보딩 경로. 여러 곳에서 가리키므로 한 곳에 둔다. */
export const PLOT_ONBOARDING_PATH = "/plots/new";

interface PlotStripProps {
  plots: readonly PlotCard[];
}

/**
 * 카드 한 장에 찍을 값.
 *
 * **표시 형식을 컴포넌트에서 만든다.** 예전에는 고정 데이터가 "D+41" 같은 완성된
 * 문자열을 들고 있었는데, 실제 조회가 붙으면 그 문자열을 만들 사람이 필요하다.
 * 계산 자체(생육단계·경과일)는 `features/growth`·`features/plots` 의 순수 함수가
 * 하고, 여기서는 사람이 읽는 말로 바꾸기만 한다.
 */
function describe(plot: PlotCard, now: Date) {
  const cropId = plot.cropIds[0];
  const cropKo = CROPS.find((c) => c.id === cropId)?.labelKo ?? "작물 미지정";

  const days = daysSincePlanting(plot, now);
  const calendar = cropId ? CROP_CALENDARS[cropId] : undefined;
  // 달력이 없는 작물(과수처럼 파종일 기준 모델이 안 맞는 것)은 단계를 비운다.
  const stage = calendar && days !== null ? stageAt(calendar, days) : null;

  return {
    cropKo,
    // 심은 날을 모르면 D+n 이 거짓말이 된다. 그대로 비운다.
    dayLabelKo: days === null ? "심은 날 미상" : `D+${days}`,
    stageKo: stage?.nameKo ?? null,
    areaKo:
      plot.areaM2 === null
        ? "넓이 미입력"
        : `${Math.round(plot.areaM2).toLocaleString("ko-KR")}㎡`,
  };
}

export function PlotStrip({ plots }: PlotStripProps) {
  if (plots.length === 0) return <EmptyPlots />;

  // 한 번만 읽는다. 카드마다 new Date() 를 부르면 목록 안에서 경과일이 갈릴 수 있다.
  const now = new Date();

  return (
    // 음수 마진 + 패딩으로 카드가 화면 가장자리까지 흘러 나가는 느낌을 준다.
    // 잘린 카드가 보여야 "옆에 더 있다"가 스크롤바 없이도 전달된다.
    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
      {plots.map((plot) => {
        const view = describe(plot, now);
        return (
          <Link
            className="group w-[15.5rem] shrink-0 rounded-lg border border-border bg-surface p-4 transition-[transform,border-color,box-shadow] duration-200 ease-out-expo hover:-translate-y-0.5 hover:border-accent hover:shadow-e2"
            href={`/plots/${plot.id}`}
            key={plot.id}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-subtle text-accent">
                <FieldIcon />
              </span>
              {view.stageKo && (
                <Badge size="sm" tone="telemetry">
                  {view.stageKo}
                </Badge>
              )}
            </div>

            <p className="mt-3 truncate font-semibold text-[0.95rem] text-fg">
              {plot.nameKo ?? "이름 없는 밭"}
            </p>
            <p className="mt-0.5 truncate text-fg-muted text-xs">
              {view.cropKo} · {view.areaKo}
            </p>

            <p className="mt-3 font-mono text-[1.35rem] text-accent tabular-nums leading-none">
              {view.dayLabelKo}
            </p>
          </Link>
        );
      })}

      {/* 목록의 끝이 곧 추가 자리. */}
      <Link
        className="grid w-[11rem] shrink-0 place-items-center rounded-lg border border-border border-dashed bg-surface-2/40 p-4 text-center transition-colors duration-200 ease-out-expo hover:border-accent hover:bg-accent-subtle"
        href={PLOT_ONBOARDING_PATH}
      >
        <span>
          <span className="mx-auto grid size-8 place-items-center rounded-full bg-accent text-accent-on">
            <MapPinIcon />
          </span>
          <span className="mt-2 block font-medium text-fg text-sm">
            텃밭 등록
          </span>
          <span className="mt-0.5 block text-fg-subtle text-xs">
            지도에서 위치 찍기
          </span>
        </span>
      </Link>
    </div>
  );
}

/**
 * 텃밭이 하나도 없을 때.
 *
 * 이 서비스는 밭이 있어야 아무것도 할 수 있으므로, 빈 상태는 안내가 아니라
 * **다음 행동 하나**여야 한다. 그래서 문구보다 버튼이 크다.
 */
function EmptyPlots() {
  return (
    <div className="rounded-lg border border-accent/30 border-dashed bg-accent-subtle/50 px-6 py-10 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent text-2xl text-accent-on shadow-e2">
        <SproutIcon />
      </span>
      <p className="mt-4 font-semibold text-fg text-lg">
        아직 등록된 텃밭이 없습니다
      </p>
      <p className="mx-auto mt-2 max-w-md text-balance text-fg-muted text-sm leading-relaxed">
        밭 위치를 찍어 주시면 그 자리의 기상 관측으로 할 일을 만들어 드립니다.
        지도에서 한 번 누르면 끝납니다.
      </p>
      <div className="mt-5 flex justify-center">
        <ButtonLink href={PLOT_ONBOARDING_PATH} size="lg">
          텃밭 등록하기
        </ButtonLink>
      </div>
    </div>
  );
}
