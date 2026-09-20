import { SatelliteIcon } from "@/components/icons";
import { ObservationChart } from "@/components/monitoring/chart/ObservationChart";
import type { SatelliteObservations } from "@/shared/aiService/client";
import {
  describeNdmiTrend,
  describeNdvi,
} from "@/shared/growth/vegetationText";

/**
 * ---------------------------------------------
 * [Feature]: 밭 하나의 NDVI·NDMI — `/weather` 밭 줄 안
 *
 * [Description]
 * - 랜딩의 상주 데모(`SatelliteView`)와 같은 차트 컴포넌트를 쓰되, 여기는
 *   실제 밭 좌표를 그때그때 조회한 값이다(ai-service `/v1/satellite/observations`,
 *   Sentinel Hub Statistical API). 필지가 하나라 계열도 하나다.
 * - 구름·위성 재방문 주기(5일) 때문에 며칠에 한 번꼴로만 점이 남는다 —
 *   랜딩 문구가 짚은 한계와 같다.
 * - 값 범위를 고정하지 않는다. 논·밭·과수원마다 NDVI 대가 달라 랜딩처럼
 *   범위를 미리 정할 수 없으므로, 받아온 값의 최소~최대에 여백만 둔다.
 * - **수치 옆에 사람 말을 같이 보인다.** NDVI 0.79 를 보여 줘도 파릇한지 알 수 없다.
 *   등급·변화를 한 줄로 옮긴다(`shared/growth/vegetationText`).
 *   ⚠ 판정에는 안 쓴다 — 물을 줄지는 기상이 정한다. 여기는 **보여주기만** 한다.
 * - **출처와 마지막 관측일을 같이 보인다.** 실측으로 관측이 평균 18일에 한 번밖에
 *   안 남는다(2026-09-19 · 전남 밭 3곳 · 90일에 5건 · 최장 공백 32일).
 *   날짜가 없으면 사용자는 "왜 값이 안 변하지" 를 알 수 없다.
 *   ⚠ **출처 줄이 이 블록 것임이 보여야 한다.** 펼친 패널은 `h4` 블록을 gap 만
 *     두고 평평하게 쌓아서, 위에 붙은 기상 블록(주간 기온 — 기상청·Open-Meteo)의
 *     꼬리말처럼 읽혔다. 그래서 (1) 위에 선을 그어 블록을 끊고 (2) 줄 맨 앞에
 *     "위성 관측" 이라는 주어를 세운다. 출처는 그 뒤에 붙는 단서다.
 *   ⚠ 원천이 바뀔 예정(2027 농림위성)이라는 계획은 **화면에 쓰지 않는다** —
 *     농민에게 쓸모가 없고, 일정이 밀리면 거짓말이 된다. 그 얘기는
 *     `ai-service/pipeline/sentinelhub_client.py` 머리에 적어 두었다.
 * ---------------------------------------------
 */

const SUMMARY =
  "이 밭 좌표의 NDVI(잎이 우거진 정도)·NDMI(잎 속 수분). 구름과 위성 재방문 주기 때문에 며칠에 한 번꼴로만 값이 남습니다.";

/** 눈에 보이는 출처. `summary` 는 차트의 접근성 설명이라 화면에 안 나온다. */
const SOURCE_KO = "Copernicus Sentinel-2 · 10m";

/** "YYYY-MM-DD" 두 개의 날수 차이. 관측이 한 달 넘게 벌어지면 견주지 않는다. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

function domainOf(
  points: SatelliteObservations["points"],
  key: "ndvi" | "ndmi",
): { lo: number; hi: number } {
  const values = points.map((point) => point[key]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max((max - min) * 0.15, 0.05);
  return { lo: min - pad, hi: max + pad };
}

function toChartPoints(
  points: SatelliteObservations["points"],
  key: "ndvi" | "ndmi",
) {
  // 서버는 "YYYY-MM-DD"를 준다. 차트는 "MM-DD"만 안다(연도를 넘는 구간을 다루지 않는다).
  return points.map((point) => ({
    date: point.date.slice(5),
    value: point[key],
  }));
}

export function SatellitePanel({
  points,
}: {
  points: SatelliteObservations["points"];
}) {
  if (points.length === 0) return null;

  // 서버가 날짜 오름차순으로 준다. 마지막이 가장 최근 관측이다
  const last = points[points.length - 1];
  // 견줄 앞 관측. 하나뿐이면 undefined 라 문장이 안 나온다 — 침묵이 기본값이다
  const prev = points.length >= 2 ? points[points.length - 2] : undefined;

  const ndviKo = describeNdvi(last.ndvi);
  const ndmiKo = describeNdmiTrend(last.ndmi, prev?.ndmi, {
    // 단계를 아직 안 넘겨받는다. 익어 가는 중이면 '정상' 이라고 말해 줘야 하는데
    // 이 컴포넌트는 작물을 모른다 — 넘겨줄 자리를 만드는 것은 별건이다.
    isRipening: false,
    gapDays: prev ? daysBetween(prev.date, last.date) : undefined,
  });

  return (
    // 위쪽 테두리가 기상 블록과의 경계다. 아래의 "7일 수치" 접이줄과 같은 방식이라
    // 펼친 패널이 [기상] | [위성] | [수치] 세 덩이로 읽힌다.
    <section className="flex flex-col gap-4 border-border/60 border-t pt-4">
      <h4 className="flex flex-wrap items-center gap-x-1.5 text-fg-subtle text-xs">
        <SatelliteIcon className="size-3.5 shrink-0 text-telemetry" />
        <span className="font-semibold text-fg-muted">위성 관측</span>
        <span>
          · {SOURCE_KO} · 최근 관측 {last.date}
        </span>
      </h4>
      <div>
        <h5 className="text-fg-muted text-xs">NDVI · 잎이 우거진 정도</h5>
        {ndviKo && <p className="mt-0.5 text-fg text-sm">{ndviKo}</p>}
        <div className="mt-2">
          <ObservationChart
            domain={domainOf(points, "ndvi")}
            height={140}
            series={[
              {
                nameKo: "NDVI",
                tone: "accent",
                points: toChartPoints(points, "ndvi"),
              },
            ]}
            summary={SUMMARY}
            tickStep={0.1}
          />
        </div>
      </div>
      <div>
        <h5 className="text-fg-muted text-xs">NDMI · 잎 속 수분</h5>
        {ndmiKo && <p className="mt-0.5 text-fg text-sm">{ndmiKo}</p>}
        <div className="mt-2">
          <ObservationChart
            domain={domainOf(points, "ndmi")}
            height={140}
            series={[
              {
                nameKo: "NDMI",
                tone: "telemetry",
                points: toChartPoints(points, "ndmi"),
              },
            ]}
            summary={SUMMARY}
            tickStep={0.1}
          />
        </div>
      </div>
    </section>
  );
}
