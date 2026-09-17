import "server-only";
import type { PlotForecast } from "./client";

/**
 * ---------------------------------------------
 * [Feature]: 밭 예보 캐시 폴백 — ai-service 가 죽었을 때 마지막으로 받은 값
 *
 * [Description]
 * - 예보 호출이 실패하면 화면이 통째로 "불러오지 못했습니다"가 된다. 그런데 날씨는
 *   분 단위로 뒤집히는 값이 아니라서, **조금 전 값이라도 보여주는 편이** 아무것도
 *   못 보는 것보다 낫다. 그래서 성공한 응답을 들고 있다가 실패 때 내준다.
 * - **반드시 `cachedAt` 과 함께 내준다.** 이게 이 파일의 핵심이다. 언제 것인지
 *   말하지 않고 옛 예보를 보여주는 건 폴백이 아니라 거짓말이다 — 사흘 전 서리
 *   예보를 오늘 것으로 읽으면 실제 피해가 난다. 화면은 이 값을 반드시 표시한다.
 * - **오래된 것은 아예 안 내준다.** `MAX_AGE_MS` 를 넘으면 없는 것으로 친다.
 *   그쯤 되면 "옛날 값"이 아니라 틀린 값이다.
 *
 * ⚠️ **프로세스 메모리다.** 재배포·재시작이면 비고, 서버 인스턴스가 여럿이면
 *    인스턴스마다 따로 갖는다. 노리는 건 딱 하나 — ai-service 의 짧은 장애나
 *    재배포 구간을 Next 쪽이 버티는 것이다. 그 이상이 필요해지면(인스턴스 간
 *    공유, 재시작 후에도 유지) Supabase 테이블로 올릴 것.
 *
 * [Usage]
 * ```ts
 * rememberForecast(key, data);          // 성공했을 때
 * const stale = recallForecast(key);    // 실패했을 때
 * ```
 * ---------------------------------------------
 */

/** 이 시간이 지난 값은 없는 것으로 친다. 6시간이면 하루 안의 흐름은 아직 유효하다. */
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

/**
 * 들고 있을 밭 수. 메모리가 무한정 늘지 않게 막는 상한이다.
 * 넘으면 가장 오래 안 쓴 것부터 버린다(Map 은 삽입 순서를 지킨다).
 */
const MAX_ENTRIES = 200;

interface Entry {
  data: PlotForecast;
  cachedAt: number;
}

const store = new Map<string, Entry>();

export interface StaleForecast {
  data: PlotForecast;
  /** 이 값을 받아 둔 시각. 화면이 "몇 시 기준"이라고 적는 근거다. */
  cachedAt: Date;
}

export function rememberForecast(key: string, data: PlotForecast): void {
  // 다시 넣기 전에 지운다 — Map 은 기존 키를 덮어써도 삽입 순서를 유지해서,
  // 지우지 않으면 자주 쓰는 밭이 계속 앞줄에 남아 먼저 버려진다.
  store.delete(key);
  store.set(key, { data, cachedAt: Date.now() });

  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next();
    if (oldest.done) break;
    store.delete(oldest.value);
  }
}

export function recallForecast(key: string): StaleForecast | null {
  const entry = store.get(key);
  if (!entry) return null;

  const age = Date.now() - entry.cachedAt;
  if (age > MAX_AGE_MS) {
    // 다음 요청이 또 재 보지 않도록 그때 치운다.
    store.delete(key);
    return null;
  }

  return { data: entry.data, cachedAt: new Date(entry.cachedAt) };
}

/** 테스트 전용. 모듈 상태가 테스트끼리 새지 않게 한다. */
export function clearForecastCache(): void {
  store.clear();
}
