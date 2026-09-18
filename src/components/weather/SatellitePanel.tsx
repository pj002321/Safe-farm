import { ObservationChart } from "@/components/monitoring/chart/ObservationChart";
import type { SatelliteObservations } from "@/shared/aiService/client";

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
 * ---------------------------------------------
 */

const SUMMARY =
  "이 밭 좌표의 NDVI(잎이 우거진 정도)·NDMI(잎 속 수분). 구름과 위성 재방문 주기 때문에 며칠에 한 번꼴로만 값이 남습니다.";

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

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h4 className="text-fg-muted text-xs">NDVI · 잎이 우거진 정도</h4>
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
        <h4 className="text-fg-muted text-xs">NDMI · 잎 속 수분</h4>
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
