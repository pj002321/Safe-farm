import {
  AlertTriangleIcon,
  CloseIcon,
  CloudRainIcon,
  SnowflakeIcon,
  SunIcon,
  TyphoonIcon,
  WindIcon,
} from "@/components/icons";
import { Badge } from "@/components/shared/Badge";
import type { SigunguWarnFeatureCollection } from "@/shared/aiService/client";
import {
  GDD_DEFAULT_COLOR,
  type GddProperties,
  type Layer,
  type RainProperties,
  type WarnProperties,
  type WindProperties,
} from "./sigunguLayers";

/**
 * ---------------------------------------------
 * [Feature]: 시군구 지도의 범례 · 특보 줄 · 갱신 표시
 *
 * [Description]
 * - 지도 컴포넌트에서 갈라냈다(500줄 초과). 셋 다 **지도 상태를 읽기만** 하고
 *   바꾸지 않아 따로 두어도 결합이 늘지 않는다.
 * - ⚠️ 등급 색이 원시 hex 다. 폴리곤 색을 ai-service 가 hex 로 주기 때문에,
 *   범례만 토큰으로 바꾸면 **범례가 거짓말을 한다.** 서버가 등급 번호만 주도록
 *   바뀔 때 양쪽을 같은 커밋에서 옮길 것.
 * ---------------------------------------------
 */

export function LiveIndicator() {
  return (
    <span className="inline-flex items-center gap-1.5 text-fg-subtle text-xs">
      <span className="relative grid size-2 place-items-center">
        <span className="absolute inset-0 animate-pulse-ring rounded-full bg-telemetry" />
        <span className="size-1.5 rounded-full bg-telemetry" />
      </span>
      실시간 반영 중
    </span>
  );
}

/** 특보 종류마다 아이콘을 붙인다. 못 아는 종류(건조·풍랑 등)는 경고 삼각형으로 받는다. */
const WARN_KIND_ICONS: Record<string, typeof AlertTriangleIcon> = {
  태풍: TyphoonIcon,
  강풍: WindIcon,
  호우: CloudRainIcon,
  대설: SnowflakeIcon,
  한파: SnowflakeIcon,
  폭염: SunIcon,
};

/**
 * 지금 발효 중인 특보 종류를 중복 없이 뽑아 배지로 보여준다.
 *
 * **하나도 없을 때 아무것도 안 그리면 안 된다.** 특보 레이어는 특보가 없는 날
 * 폴리곤을 한 장도 칠하지 않아서, 말이 없으면 빈 지도가 고장으로 읽힌다.
 * 대부분의 날이 그 상태다.
 */
export function WarnSummary({ data }: { data: SigunguWarnFeatureCollection }) {
  const kinds: string[] = [];
  for (const feature of data.features) {
    for (const kind of feature.properties.warnings ?? []) {
      if (!kinds.includes(kind)) kinds.push(kind);
    }
  }

  if (kinds.length === 0) {
    return (
      <p className="text-fg-muted text-sm">
        현재 발효 중인 기상특보가 없습니다.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {kinds.map((kind) => {
        const Icon = WARN_KIND_ICONS[kind] ?? AlertTriangleIcon;
        return (
          <Badge
            icon={<Icon className="size-3.5" />}
            key={kind}
            tone="unsuitable"
          >
            {kind} 특보
          </Badge>
        );
      })}
    </div>
  );
}

const GDD_LEGEND_ITEMS = [
  { color: "#2563eb", labelKo: "평년보다 낮음" },
  { color: "#93c5fd", labelKo: "평년과 비슷(낮은 쪽)" },
  { color: "#fdba74", labelKo: "평년과 비슷(높은 쪽)" },
  { color: "#dc2626", labelKo: "평년보다 높음" },
  { color: GDD_DEFAULT_COLOR, labelKo: "데이터 없음" },
];

const WARN_COLOR = "#dc2626";

// app/domain/weather_region.py 의 강수·바람 등급과 색을 그대로 맞춘다.
const RAIN_LEGEND_ITEMS = [
  { color: "#dbeafe", labelKo: "강수 없음" },
  { color: "#93c5fd", labelKo: "약한 비" },
  { color: "#3b82f6", labelKo: "보통 비" },
  { color: "#f97316", labelKo: "강한 비" },
  { color: "#dc2626", labelKo: "매우 강한 비" },
  { color: GDD_DEFAULT_COLOR, labelKo: "데이터 없음" },
];

const WIND_LEGEND_ITEMS = [
  { color: "#a7f3d0", labelKo: "약함" },
  { color: "#6ee7b7", labelKo: "약간 강함" },
  { color: "#fdba74", labelKo: "강함" },
  { color: "#f97316", labelKo: "강풍주의보 수준" },
  { color: "#dc2626", labelKo: "강풍경보 수준" },
  { color: GDD_DEFAULT_COLOR, labelKo: "데이터 없음" },
];

export function Legend({
  layer,
  asOf,
}: {
  layer: Layer;
  asOf: string | null | undefined;
}) {
  const items =
    layer === "gdd"
      ? GDD_LEGEND_ITEMS
      : layer === "warn"
        ? [{ color: WARN_COLOR, labelKo: "발효 중인 특보" }]
        : layer === "rain"
          ? RAIN_LEGEND_ITEMS
          : WIND_LEGEND_ITEMS;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-fg-muted text-xs">
      {items.map((item) => (
        <span className="flex items-center gap-1.5" key={item.color}>
          <span
            className="size-3 rounded-sm"
            style={{ backgroundColor: item.color }}
          />
          {item.labelKo}
        </span>
      ))}
      <span className="text-fg-subtle">기준일 {asOf ?? "정보 없음"}</span>
    </div>
  );
}

/**
 * 고른 시군구의 실제 수치.
 *
 * 속성 스냅샷이 아니라 **레이어와 속성을 따로** 받는다. 선택은 코드 하나로만
 * 들고 있고 값은 매 렌더에 현재 데이터에서 찾으므로, 폴링으로 값이 새로 와도
 * 카드가 옛 숫자를 계속 보여주는 일이 없다.
 */
export function RegionInfo({
  layer,
  properties,
  onClose,
}: {
  layer: Layer;
  properties: GddProperties | WarnProperties | RainProperties | WindProperties;
  /** 지도 위에 떠 있으므로 닫을 방법이 있어야 한다 — 가린 곳을 보려면 치워야 한다. */
  onClose: () => void;
}) {
  return (
    // 지도 타일 위에 뜬다. 반투명 + blur 로 아래 지도가 비쳐서 "지도 위의 층"임이
    // 보이게 한다(불투명하면 지도가 잘린 것처럼 읽힌다).
    <div className="pointer-events-auto flex items-start gap-3 rounded-lg border border-border bg-surface/95 px-4 py-2.5 text-sm shadow-md backdrop-blur">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-fg">{properties.name}</p>
        <p className="mt-0.5 text-fg-muted text-xs leading-relaxed">
          {detail(layer, properties)}
        </p>
      </div>
      <button
        aria-label="닫기"
        className="-mr-1 -mt-0.5 grid size-8 shrink-0 place-items-center rounded-md text-fg-subtle transition-colors duration-200 ease-out-expo hover:bg-surface-2 hover:text-fg"
        onClick={onClose}
        type="button"
      >
        <CloseIcon className="size-4" />
      </button>
    </div>
  );
}

/** 레이어마다 다른 한 줄. 값이 없으면 "데이터 없음"으로 정직하게 적는다. */
function detail(
  layer: Layer,
  p: GddProperties | WarnProperties | RainProperties | WindProperties,
): string {
  if (layer === "gdd") {
    const g = p as GddProperties;
    if (g.deviationPct == null) return g.label ?? "데이터 없음";
    const sign = g.deviationPct > 0 ? "+" : "";
    return `누적 ${g.actualGdd}GDD (평년 ${g.normalGdd}GDD, ${sign}${g.deviationPct}%) · ${g.label}`;
  }
  if (layer === "warn") return (p as WarnProperties).label ?? "특보 없음";
  if (layer === "rain") {
    const r = p as RainProperties;
    return `${r.rainMm != null ? `${r.rainMm}mm` : "데이터 없음"} · ${r.label}`;
  }
  const w = p as WindProperties;
  return `${w.windMax != null ? `${w.windMax}m/s` : "데이터 없음"} · ${w.label}`;
}
