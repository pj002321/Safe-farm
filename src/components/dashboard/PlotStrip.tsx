import Link from "next/link";
import { FieldIcon, MapPinIcon, SproutIcon } from "@/components/icons";
import { plotFaceClass } from "@/components/plot/plotFace";
import { Badge } from "@/components/shared/Badge";
import { ButtonLink } from "@/components/shared/Button";
import type { PlotStripItem } from "@/features/plots/domain/plotStrip";

/**
 * ---------------------------------------------
 * [Feature]: 텃밭 요약 가로 스크롤 + 등록 진입점 (마크업 전용)
 *
 * [Description]
 * - 등록된 텃밭을 D+n 과 생육단계 배지로 요약해 가로로 흘린다(스펙).
 *   세로 목록이 아닌 이유는 밭이 늘어도 "오늘 할 일"이 화면 아래로 밀리지
 *   않게 하려는 것이다.
 * - **글자는 이미 만들어져 들어온다.** 작물 이름·경과일·면적은
 *   `toPlotStripItem`(features/plots) 이 내고, 이 파일은 그대로 찍기만 한다.
 *   작물 이름이 `cultivations` 를 타고 오면서 화면에 박아 둔 작물 목록으로는
 *   더 이상 맞출 수 없어졌다.
 * - 가로 스크롤은 **컨테이너 안에서만** 일어난다. `overflow-x-auto` 를 이 줄에
 *   가두지 않으면 페이지 전체가 좌우로 흔들린다.
 * - 마지막 칸이 **텃밭 등록 카드**다. 별도 버튼만 두면 밭이 늘어났을 때 어디서
 *   추가하는지 매번 찾아야 한다. 목록의 끝이 곧 "여기서 더한다"가 되게 한다.
 * - 밭이 하나도 없을 때는 카드 줄 대신 **온보딩 유도**를 그린다(스펙의 빈 상태).
 *   빈 가로 스크롤은 화면이 고장 난 것처럼 보인다.
 *
 * - 카드를 누르면 **그 밭의 상세**로 간다. 예전에는 셋 다 등록 화면으로 갔는데,
 *   그때는 값이 샘플이라 갈 곳이 없었다.
 * - 생육 단계는 없을 수 있다. 누적 GDD 가 붙기 전에는 단계를 못 내는 밭이
 *   대부분이라, 배지 자리를 비워 두고 카드는 그대로 그린다.
 *
 * [Usage]
 * ```tsx
 * <PlotStrip plots={items} />
 * <PlotStrip plots={[]} />        // 온보딩 유도
 * ```
 * ---------------------------------------------
 */

/** 텃밭 등록 온보딩 경로. 여러 곳에서 가리키므로 한 곳에 둔다. */
export const PLOT_ONBOARDING_PATH = "/plots/new";

interface PlotStripProps {
  plots: readonly PlotStripItem[];
}

export function PlotStrip({ plots }: PlotStripProps) {
  if (plots.length === 0) return <EmptyPlots />;

  return (
    // 음수 마진 + 패딩으로 카드가 화면 가장자리까지 흘러 나가는 느낌을 준다.
    // 잘린 카드가 보여야 "옆에 더 있다"가 스크롤바 없이도 전달된다.
    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
      {plots.map((plot) => (
        <Link
          className="group w-[15.5rem] shrink-0 rounded-lg border border-border bg-surface p-4 transition-[transform,border-color,box-shadow] duration-200 ease-out-expo hover:-translate-y-0.5 hover:border-accent hover:shadow-e2"
          href={`/plots/${plot.id}`}
          key={plot.id}
        >
          <div className="flex items-start justify-between gap-2">
            {/* 색은 밭 id 에서 온다. 같은 밭은 목록·상세 어디서나 같은 얼굴이라
                눈이 자리를 기억한다. 작물별 그림은 없다 — 화면에 박아 둔 작물
                목록이 작물 마스터와 이어지지 않아 배추밭에 딴 그림이 붙는다. */}
            <span
              className={`grid size-8 shrink-0 place-items-center rounded-full ${plotFaceClass(plot.id)}`}
            >
              <FieldIcon />
            </span>
            {plot.stageKo && (
              <Badge size="sm" tone="telemetry">
                {plot.stageKo}
              </Badge>
            )}
          </div>

          <p className="mt-3 truncate font-semibold text-[0.95rem] text-fg">
            {plot.nameKo}
          </p>
          <p className="mt-0.5 truncate text-fg-muted text-xs">
            {plot.cropKo} · {plot.areaKo}
          </p>

          <p className="mt-3 font-mono text-[1.35rem] text-accent tabular-nums leading-none">
            {plot.dayLabelKo}
          </p>
        </Link>
      ))}

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
