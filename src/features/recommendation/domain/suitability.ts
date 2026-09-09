/**
 * ---------------------------------------------
 * [Feature]: 작물 생육 적합도 계산
 *
 * [Description]
 * - 이 파일이 제품의 심장이다. 여기가 틀리면 추천이 틀린다.
 * - **순수 함수만 둔다.** DB·네트워크·LLM·Next 의존성 0.
 *   그래서 (1) 테스트가 빠르고 (2) LangGraph 노드에서 그대로 쓰고
 *   (3) 나중에 Compute 워커로 옮겨도 그대로 돈다.
 * - 이 프로젝트에서 TDD를 하는 곳은 여기다. 나머지는 하지 않는다.
 *
 * [Usage]
 * ```ts
 * const result = scoreSuitability(tomato, { avgTempC: 22, rainfallMm: 60, sunshineHours: 7 });
 * // → { score: 91, grade: "good", risks: [] }
 * ```
 * ---------------------------------------------
 */

/** 한 재배 구간의 관측/예보 요약값. */
export interface WeatherWindow {
  /** 구간 평균 기온 (°C) */
  avgTempC: number;
  /** 구간 누적 강수량 (mm) */
  rainfallMm: number;
  /** 일 평균 일조시간 (h) */
  sunshineHours: number;
}

/** 작물이 요구하는 생육 조건. 각 범위는 [최소, 최대] 포함 구간. */
export interface CropProfile {
  id: string;
  nameKo: string;
  tempRangeC: readonly [number, number];
  rainfallRangeMm: readonly [number, number];
  minSunshineHours: number;
}

export type RiskKind = "cold" | "heat" | "drought" | "flood" | "lowLight";

export interface Risk {
  kind: RiskKind;
  /** 허용 범위에서 벗어난 정도(0~1). 1이면 심각. */
  severity: number;
}

export type Grade = "good" | "caution" | "unsuitable";

export interface SuitabilityResult {
  cropId: string;
  /** 0~100 정수. 높을수록 적합. */
  score: number;
  grade: Grade;
  risks: Risk[];
}

/** 범위 밖으로 벗어난 정도를 0~1로 정규화한다. 범위 안이면 0. */
function deviation(
  value: number,
  [min, max]: readonly [number, number],
): number {
  if (value >= min && value <= max) return 0;
  const span = max - min;
  // span이 0이면(단일값 요구) 상대화가 불가능하므로 절대 편차를 1로 취급한다.
  if (span <= 0) return 1;
  const distance = value < min ? min - value : value - max;
  return Math.min(distance / span, 1);
}

/**
 * 작물 하나에 대한 적합도를 계산한다.
 *
 * 감점은 세 축(기온·강수·일조)의 이탈도를 가중 합산한다. 기온 이탈이 가장
 * 치명적이라 가중치가 높다 — 냉해/고온장해는 회복이 안 되지만 물은 관수로,
 * 빛은 시설로 어느 정도 보정할 수 있기 때문이다.
 */
export function scoreSuitability(
  crop: CropProfile,
  weather: WeatherWindow,
): SuitabilityResult {
  const risks: Risk[] = [];

  const tempDev = deviation(weather.avgTempC, crop.tempRangeC);
  if (tempDev > 0) {
    risks.push({
      kind: weather.avgTempC < crop.tempRangeC[0] ? "cold" : "heat",
      severity: tempDev,
    });
  }

  const rainDev = deviation(weather.rainfallMm, crop.rainfallRangeMm);
  if (rainDev > 0) {
    risks.push({
      kind: weather.rainfallMm < crop.rainfallRangeMm[0] ? "drought" : "flood",
      severity: rainDev,
    });
  }

  // 일조는 하한만 본다. 많아서 문제가 되는 경우는 고온장해로 이미 잡힌다.
  const lightShortfall = Math.max(
    0,
    crop.minSunshineHours - weather.sunshineHours,
  );
  const lightDev =
    crop.minSunshineHours > 0
      ? Math.min(lightShortfall / crop.minSunshineHours, 1)
      : 0;
  if (lightDev > 0) {
    risks.push({ kind: "lowLight", severity: lightDev });
  }

  const penalty = tempDev * 50 + rainDev * 30 + lightDev * 20;
  const score = Math.round(Math.max(0, 100 - penalty));

  return { cropId: crop.id, score, grade: toGrade(score), risks };
}

function toGrade(score: number): Grade {
  if (score >= 80) return "good";
  if (score >= 50) return "caution";
  return "unsuitable";
}

/** 여러 후보 작물을 점수 내림차순으로 정렬한다. 동점이면 cropId 사전순으로 안정화. */
export function rankCrops(
  crops: readonly CropProfile[],
  weather: WeatherWindow,
): SuitabilityResult[] {
  return crops
    .map((crop) => scoreSuitability(crop, weather))
    .sort((a, b) => b.score - a.score || a.cropId.localeCompare(b.cropId));
}
