import { CloseIcon, GaugeIcon, SatelliteIcon } from "@/components/icons";
import { Badge } from "@/components/shared/Badge";
import { Card } from "@/components/shared/Card";
import { formatLatLon } from "@/features/monitoring/domain/geo";
import {
  HAZARDS,
  type HazardLevel,
  type ObservationSite,
} from "@/features/monitoring/domain/hazards";

/**
 * ---------------------------------------------
 * [Feature]: 선택된 관측 지점 상세 패널
 *
 * [Description]
 * - 지구본에서 고른 핫스팟 하나를 읽는 카드다. 히어로(어두운 우주) 위에 떠 있으므로
 *   Card 의 `glass` 톤을 쓴다 — 밝은 배경 위에 두면 backdrop-blur 가 할 일이 없다.
 * - 좌표·면적·선행 시간은 전부 `font-mono tabular-nums` 다. 다른 지점으로 바꿀 때
 *   숫자 폭이 달라 패널이 들썩이면 계측 화면처럼 보이지 않는다.
 * - 게이지 최대치는 72시간(3일)이다. 가뭄(168h)처럼 이를 넘는 값은 꽉 찬 막대로
 *   보여준다. "3일 이상이면 충분히 대응 가능"이 이 막대가 말하려는 전부이고,
 *   168h 를 기준으로 잡으면 우박(3h)이 눈에 보이지 않을 만큼 짧아진다.
 * - `site` 가 null 이면 아무것도 그리지 않는다. 빈 껍데기를 띄우면 지구본을 가린다.
 *
 * [Usage]
 * ```tsx
 * <SitePanel site={selectedSite} onClose={() => setSelectedId(null)} />
 * ```
 * ---------------------------------------------
 */

interface SitePanelProps {
  site: ObservationSite | null;
  onClose: () => void;
}

/** 기상청 경보 체계와 같은 3단계. 코드 식별자는 영어, 화면은 한국어다. */
const LEVEL_LABEL: Record<HazardLevel, string> = {
  watch: "관심",
  advisory: "주의보",
  warning: "경보",
};

/** 대응 가능 시간 게이지의 상한(시간). 위 주석의 근거를 한 곳에 둔다. */
const LEAD_TIME_FULL_HOURS = 72;

export function SitePanel({ site, onClose }: SitePanelProps) {
  if (!site) return null;

  const hazard = HAZARDS[site.hazard];
  const leadRatio = Math.min(1, hazard.leadTimeHours / LEAD_TIME_FULL_HOURS);

  return (
    <Card as="div" padding="sm" tone="night">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col items-start gap-2">
          <p className="font-semibold text-sm text-space-fg">{site.nameKo}</p>
          <Badge dot size="sm" tone={hazard.toneToken}>
            {hazard.nameKo} {LEVEL_LABEL[site.level]}
          </Badge>
        </div>

        <button
          aria-label="관측 지점 정보 닫기"
          className="-mr-1 -mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-space-muted transition-colors duration-200 ease-out-expo hover:bg-space-fg/10 hover:text-space-fg"
          onClick={onClose}
          type="button"
        >
          <CloseIcon />
        </button>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-[0.7rem] tabular-nums">
        <Row label="좌표" value={formatLatLon(site.coord)} />
        <Row label="면적" value={`${site.areaHa.toLocaleString("ko-KR")} ha`} />
        <div className="col-span-2 flex flex-col gap-1">
          <dt className="text-space-muted uppercase tracking-[0.12em]">위성</dt>
          <dd className="flex items-center gap-1.5 text-space-fg">
            <SatelliteIcon aria-hidden="true" className="text-telemetry" />
            {site.satellite}
          </dd>
        </div>
      </dl>

      {/* 지구본 위에 얹히는 카드라 세로가 길면 3D 를 둔 의미가 없어진다.
          관측 요약은 두 줄로 자르고, 전문은 아래 관측 현황 표가 보여준다. */}
      <p className="mt-3 line-clamp-2 text-space-muted text-xs leading-relaxed">
        {site.noteKo}
      </p>

      <div className="mt-3 border-space-border border-t pt-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-space-muted text-xs">
            <GaugeIcon aria-hidden="true" />
            대응 가능 시간
          </span>
          <span className="font-mono text-space-fg text-sm tabular-nums">
            {hazard.leadTimeHours}시간
          </span>
        </div>
        {/*
          막대는 위 숫자를 눈으로 한 번 더 보여주는 장식이라 aria-hidden 이다.
          progressbar 롤을 주면 스크린리더가 같은 값을 두 번 읽는다.
        */}
        <div
          aria-hidden="true"
          className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-space-fg/15"
        >
          <div
            className="h-full rounded-full bg-telemetry transition-[width] duration-500 ease-out-expo"
            style={{ width: `${leadRatio * 100}%` }}
          />
        </div>
      </div>
    </Card>
  );
}

/** 라벨 + 값 한 쌍. 같은 마크업이 세 번 반복되는 걸 막는 최소 단위다. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-space-muted uppercase tracking-[0.12em]">{label}</dt>
      <dd className="text-space-fg">{value}</dd>
    </div>
  );
}
