/**
 * ---------------------------------------------
 * [Feature]: 드론 방제 적기 판정
 *
 * [Description]
 * - "언제 약을 쳐야 하나"를 시간대별로 가려낸다. 바람이 세면 약이 날리고, 이슬이
 *   없으면 잎에 스미지 않는다. 방제하시는 분들이 "해 뜰 무렵"이라고 부르는 조건을
 *   풍속·습도·일출 시각으로 옮긴 것이다.
 * - **막힌 이유를 함께 돌려준다.** "안 됩니다"만 보여주면 사용자는 언제 다시 봐야
 *   할지 모른다. `blockedByKo` 가 있어야 화면이 "바람이 세서"라고 말할 수 있다.
 * - ⚠️ 아래 임계값은 **잠정치**다. 농진청 문서에 방제 풍속 기준이 명시돼 있지 않아
 *   현장 관행을 옮겼다. 실제 방제하시는 분께 확인이 필요하며, 확인 전까지 화면에서
 *   "잠정 기준"임을 함께 밝혀야 한다.
 *
 * [Usage]
 * ```ts
 * const hours = evaluateSprayHours(TODAY_HOURLY, SPRAY_LIMITS, { sunriseMin: 367 });
 * findWindows(hours); // [{ startHour: 7, endHour: 8 }]
 * ```
 * ---------------------------------------------
 */

/** 한 시간치 예보. Open-Meteo 시간별 조회 결과를 그대로 옮긴 모양. */
export interface HourlyForecast {
  /** 0~23 */
  hour: number;
  windMs: number;
  humidityPct: number;
  tempC: number;
  rainProbPct: number;
  windDirKo: string;
}

/** 방제 가능 임계값. 전부 잠정치다(파일 상단 주석 참고). */
export interface SprayLimits {
  windMaxMs: number;
  humidityMinPct: number;
  tempMaxC: number;
  rainProbMaxPct: number;
  /** 해 뜬 뒤 몇 분까지를 아침 창으로 볼 것인가. */
  afterSunriseMaxMin: number;
}

export const SPRAY_LIMITS: SprayLimits = {
  windMaxMs: 3.0,
  humidityMinPct: 60,
  tempMaxC: 28.0,
  rainProbMaxPct: 30,
  afterSunriseMaxMin: 150,
};

export interface SprayHour extends HourlyForecast {
  ok: boolean;
  /** 막힌 이유들. 비어 있으면 가능. */
  blockedByKo: readonly string[];
}

/**
 * 시간대별 방제 가능 여부.
 *
 * `sunriseMinutes` 는 자정 기준 분(06:07 → 367). 시각을 숫자로 받는 이유는
 * `Date` 를 쓰면 실행 시각·표준시에 따라 결과가 흔들리기 때문이다.
 */
export function evaluateSprayHours(
  hours: readonly HourlyForecast[],
  limits: SprayLimits,
  context: { sunriseMinutes: number },
): SprayHour[] {
  return hours.map((h) => {
    const blocked: string[] = [];
    const minutesAfterSunrise = h.hour * 60 - context.sunriseMinutes;

    if (minutesAfterSunrise < 0) blocked.push("해 뜨기 전");
    else if (minutesAfterSunrise > limits.afterSunriseMaxMin) {
      blocked.push("아침 창 지남");
    }
    if (h.windMs > limits.windMaxMs) blocked.push("바람");
    if (h.humidityPct < limits.humidityMinPct) blocked.push("건조");
    if (h.tempC > limits.tempMaxC) blocked.push("고온");
    if (h.rainProbPct > limits.rainProbMaxPct) blocked.push("비");

    return { ...h, ok: blocked.length === 0, blockedByKo: blocked };
  });
}

export interface SprayWindow {
  /** 포함 */
  startHour: number;
  /** 포함 */
  endHour: number;
}

/**
 * 연속된 가능 시간대를 구간으로 묶는다.
 *
 * 시간마다 따로 보여주면 "07시 가능, 08시 가능"처럼 읽혀서 한눈에 안 들어온다.
 * 사용자가 알고 싶은 건 "아침 7시부터 8시까지"라는 **덩어리**다.
 */
export function findWindows(hours: readonly SprayHour[]): SprayWindow[] {
  const windows: SprayWindow[] = [];
  let start: number | null = null;
  let prev: number | null = null;

  for (const h of hours) {
    if (h.ok) {
      // 시간이 이어지지 않으면(예보에 구멍) 별개 구간으로 끊는다.
      if (start === null || prev === null || h.hour !== prev + 1) {
        if (start !== null && prev !== null) {
          windows.push({ startHour: start, endHour: prev });
        }
        start = h.hour;
      }
      prev = h.hour;
    } else if (start !== null && prev !== null) {
      windows.push({ startHour: start, endHour: prev });
      start = null;
      prev = null;
    }
  }
  if (start !== null && prev !== null) {
    windows.push({ startHour: start, endHour: prev });
  }
  return windows;
}

/** `"06:07"` → 367. 파싱 실패는 0 이 아니라 예외 — 조용히 새벽으로 만들지 않는다. */
export function toMinutes(hhmm: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!match) throw new Error(`시각 형식이 아닙니다: ${hhmm}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** 오늘 상주 밭의 시간별 예보 (Open-Meteo, 밭 좌표 기준). */
export const TODAY_HOURLY: readonly HourlyForecast[] = [
  {
    hour: 5,
    windMs: 1.1,
    humidityPct: 98,
    tempC: 16,
    rainProbPct: 0,
    windDirKo: "서북서",
  },
  {
    hour: 6,
    windMs: 1.3,
    humidityPct: 97,
    tempC: 17,
    rainProbPct: 0,
    windDirKo: "서북서",
  },
  {
    hour: 7,
    windMs: 1.5,
    humidityPct: 82,
    tempC: 19,
    rainProbPct: 0,
    windDirKo: "서북서",
  },
  {
    hour: 8,
    windMs: 1.9,
    humidityPct: 70,
    tempC: 20,
    rainProbPct: 0,
    windDirKo: "북서",
  },
  {
    hour: 9,
    windMs: 1.1,
    humidityPct: 89,
    tempC: 20,
    rainProbPct: 0,
    windDirKo: "북서",
  },
  {
    hour: 12,
    windMs: 2.8,
    humidityPct: 68,
    tempC: 25,
    rainProbPct: 0,
    windDirKo: "서",
  },
  {
    hour: 15,
    windMs: 3.9,
    humidityPct: 62,
    tempC: 27,
    rainProbPct: 0,
    windDirKo: "서",
  },
  {
    hour: 18,
    windMs: 1.8,
    humidityPct: 57,
    tempC: 24,
    rainProbPct: 0,
    windDirKo: "서북서",
  },
];

/** 오늘 해 뜸·짐. Open-Meteo 밭 좌표 조회값. */
export const SUN = { riseKo: "06:07", setKo: "18:38" } as const;
