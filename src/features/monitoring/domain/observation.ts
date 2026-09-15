/**
 * ---------------------------------------------
 * [Feature]: 위성 관측 시계열 도메인
 *
 * [Description]
 * - 랜딩의 "위성으로 본 상주"·"좌표를 잘못 찍으면" 두 절이 쓰는 유일한
 *   데이터 출처다. 화면 컴포넌트가 숫자를 들고 있지 않게 여기로 모은다.
 * - 원본 수치는 `observationData.ts` 에 분리했다. 여기에는 타입과 파생
 *   함수만 둔다 — 데이터가 길어져도 로직 파일이 300줄을 넘지 않는다.
 * - 모든 함수는 순수 함수다. 차트가 어떤 크기로 그려지든 여기는 모른다.
 *
 * [Usage]
 * ```ts
 * import { SANGJU_SERIES, latestPoint, seriesRange } from "./observation";
 *
 * const paddy = SANGJU_SERIES[0];
 * latestPoint(paddy);            // { date: "09-12", ndvi: 0.597, ndmi: 0.266 }
 * seriesRange(paddy, "ndvi");    // { min: 0.257, max: 0.728 }
 * ```
 * ---------------------------------------------
 */

import {
  GOKSEONG_RAW,
  type RawObservation,
  SANGJU_RAW,
} from "./observationData";

/** 위성이 한 번 지나가며 남긴 값 하나. */
export interface ObservationPoint {
  /** "MM-DD" — 관측 연도는 `OBSERVATION_WINDOW` 가 들고 있다. */
  date: string;
  /** 잎이 우거진 정도. -1 ~ 1 */
  ndvi: number;
  /** 잎 속 수분. -1 ~ 1 */
  ndmi: number;
}

/** 논 · 밭 · 과수. 재는 방식이 달라 화면도 계산도 갈린다. */
export type PlotKind = "paddy" | "field" | "orchard";

/** 한 필지를 한 철 따라간 시계열. */
export interface ObservationSeries {
  plot: PlotKind;
  nameKo: string;
  elevationM: number;
  /** 날짜 오름차순. 구름 낀 날은 아예 빠져 있다(등간격이 아니다). */
  points: readonly ObservationPoint[];
}

/** 관측 기간. 차트 부제("2026-04-03 ~ 09-12")가 이 값을 쓴다. */
export const OBSERVATION_WINDOW = {
  from: "2026-04-03",
  to: "2026-09-12",
} as const;

const toPoints = (
  raw: readonly RawObservation[],
): readonly ObservationPoint[] =>
  raw.map(([date, ndvi, ndmi]) => ({ date, ndvi, ndmi }));

/** 상주 세 필지. 배열 순서가 곧 범례 순서다(논 → 밭 → 과수). */
export const SANGJU_SERIES: readonly ObservationSeries[] = [
  {
    plot: "paddy",
    nameKo: "낙동강변 논",
    elevationM: 60,
    points: toPoints(SANGJU_RAW.paddy),
  },
  {
    plot: "field",
    nameKo: "배추밭",
    elevationM: 74,
    points: toPoints(SANGJU_RAW.field),
  },
  {
    plot: "orchard",
    nameKo: "단감 과수원",
    elevationM: 158,
    points: toPoints(SANGJU_RAW.orchard),
  },
];

/** 곡성 대조군. 좌표가 실제 논이면 모내기 때 NDVI 가 떨어진다. */
export const GOKSEONG_PADDY: ObservationSeries = {
  plot: "paddy",
  nameKo: "곡성 장선리 논",
  elevationM: 0,
  points: toPoints(GOKSEONG_RAW),
};

/**
 * 차트 y축 범위를 잡기 위한 최소·최대.
 * 빈 계열이면 `{ min: 0, max: 0 }`. 차트 쪽에서 0으로 나누지 않도록
 * `createScale` 이 폭 0을 따로 막는다.
 */
export function seriesRange(
  series: ObservationSeries,
  key: "ndvi" | "ndmi",
): { min: number; max: number } {
  if (series.points.length === 0) return { min: 0, max: 0 };
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const point of series.points) {
    const value = point[key];
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return { min, max };
}

/**
 * 가장 최근 관측. 배열이 날짜 오름차순이라는 전제를 쓴다.
 * 빈 계열은 조용히 넘기지 않고 던진다 — 화면에 빈 값이 나가는 것보다
 * 데이터가 비었다는 사실이 바로 드러나는 편이 낫다.
 */
export function latestPoint(series: ObservationSeries): ObservationPoint {
  const last = series.points.at(-1);
  if (!last) {
    throw new Error(`관측이 비어 있는 계열입니다: ${series.nameKo}`);
  }
  return last;
}

/**
 * 위성 관측의 한계를 그대로 적은 문장들. 마케팅 문구로 다듬지 말 것 —
 * 이 페이지가 내세우는 값이 정직함이라 이 목록이 곧 자산이다.
 */
export const SATELLITE_NOTES: {
  readonly canDoKo: readonly string[];
} = {
  canDoKo: [
    "적산온도가 말하는 단계와 실제 잎 상태를 맞대보기",
    "비가 없는데 잎 수분이 버티면 — 물을 주셨구나",
    "비도 없고 잎 수분도 떨어지면 — 정말 마르는 중",
    "과수원 잎이 언제 나고 언제 지는지 해마다 비교",
  ],
};
