import "server-only";

import { getSupabaseServer } from "@/shared/supabase/server";
import type { MonthlyNormal } from "./forecast";
import { foldMonthlyNormals, type NormalDay } from "./normals";

/**
 * ---------------------------------------------
 * [Feature]: 월별 평년값 조회 (서버 전용)
 *
 * [Description]
 * - `normals` 는 ai-service 가 적재하는 **공용 참조 데이터**라 `user_id` 가 없고
 *   RLS 도 없다. 그래서 features 밑이 아니라 shared 에 둔다 — `stationStore.ts`
 *   와 같은 이유다.
 * - 도달 예측(`forecastArrival_2`)이 예보 밖 구간을 메울 때 읽는다. 일별로
 *   들어오는 표를 월별로 접는 일은 `normals.ts` 가 하고, 여기서는 조회만 한다.
 * - ⚠️ **관측소 목록(`stations`)과 평년값의 관측소가 일치하지 않는다.** 평년값은
 *   176곳, `stations` 는 109곳인데 그중 24곳은 평년값이 없다. 가장 가까운
 *   관측소에 평년값이 없다고 예측을 포기하면 그 지역 밭만 기능이 사라지므로,
 *   **가까운 순으로 몇 곳을 같이 물어 있는 곳을 쓴다.** 제대로 된 해법은 빠진
 *   관측소 평년값을 적재하는 것이다(ai-service 파이프라인).
 * - `tmax_normal`·`tmin_normal` 은 `double precision` 이라 supabase-js 가 숫자로
 *   준다. `numeric` 인 다른 기상 컬럼들과 달리 문자열 변환이 필요 없다.
 *
 * [Usage]
 * ```ts
 * // 인자 순서가 곧 가까운 순이다. 값이 나오는 첫 관측소에서 멈춘다.
 * const normals = await listMonthlyNormals(["119", "108", "112"]);
 * // [{ month: 1, tempMaxC: 2.1, tempMinC: -5.5 }, ...]  (없으면 [])
 * ```
 * ---------------------------------------------
 */

/**
 * 평년 기간. `normals` 에는 기간이 다른 두 벌이 같이 들어 있다.
 *
 *   kma       174곳 — 최신 30년 평년
 *   kma-1981   72곳 — 1981~2010 평년
 *
 * 70곳은 양쪽에 다 있다. **안 거르면 두 기간을 섞어 평균 낸다** — 강릉 1월
 * 최고기온이 섞으면 5.1도, `kma` 만 쓰면 5.3도다. 차이 자체는 0.1~0.4도로 작지만
 * 두 기간의 평균에는 해당하는 30년이 없다.
 *
 * 앞에 적은 순서가 곧 우선순위다. `kma` 만 고집하면 **143(대구)·146(전주)** 가
 * 통째로 빠진다 — 이 두 곳은 `kma-1981` 에만 있다. 오래된 평년값이라도 그 지역
 * 값을 쓰는 것이, 100km 밖 관측소로 밀어내는 것보다 낫다.
 */
const NORMAL_SOURCES = ["kma", "kma-1981"] as const;

/**
 * 한 관측소의 일별 평년값. 윤년까지 366행이다.
 *
 * ⚠️ `limit` 을 **명시한다.** PostgREST 는 배포에 따라 응답 행 수 상한(보통
 * 1000)이 걸려 있고, 넘으면 **오류가 아니라 잘린 결과**가 온다. 관측소 여럿을
 * 한 번에 받으면 그 선에 걸려 어떤 달은 며칠치만으로 평균이 나는데, 화면에는
 * 그럴듯한 날짜로 보인다. 그래서 관측소 하나씩 받고 상한을 366 위로 둔다.
 *
 * `source` 를 거는 이유는 상한이 아니라 정확도다 — 두 벌이 섞여 들어와 있어
 * 400행을 잘라도 12개월이 다 남는다(실측). 다만 그 400행은 두 기간이 섞인
 * 표본이라, 어느 30년의 평년도 아닌 값이 나온다.
 */
async function listStationNormals(
  station: string,
  source: string,
): Promise<NormalDay[]> {
  const supabase = await getSupabaseServer();

  const { data, error } = await supabase
    .from("normals")
    .select("month, tmax_normal, tmin_normal")
    .eq("station", station)
    .eq("source", source)
    .limit(400);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    month: row.month,
    tempMaxC: row.tmax_normal,
    tempMinC: row.tmin_normal,
  }));
}

/**
 * 가까운 순으로 넘긴 관측소 중 **평년값이 있는 첫 곳**의 월별 평년값.
 *
 * 관측소 하나마다 `NORMAL_SOURCES` 를 순서대로 묻고, 값이 나오면 거기서 멈춘다.
 * 한 관측소의 두 기간을 합치지 않는다 — 있는 쪽 한 벌만 쓴다.
 *
 * 대개 첫 관측소의 `kma` 에서 끝나 왕복은 한 번이다. 대구·전주는 두 번째 질의
 * (`kma-1981`)에서, 평년값이 아예 없는 관측소에 붙은 밭은 다음 관측소로 넘어간다.
 *
 * 하나도 없으면 빈 배열이다 — `forecastArrival_2` 는 그 상태에서 예보 끝에서
 * 멈추고 `arrivalDate: null` 을 낸다. 틀린 날짜를 내놓지 않는 쪽이다.
 */
export async function listMonthlyNormals(
  stationCodes: readonly string[],
): Promise<MonthlyNormal[]> {
  for (const code of stationCodes) {
    for (const source of NORMAL_SOURCES) {
      const monthly = foldMonthlyNormals(
        await listStationNormals(code, source),
      );
      if (monthly.length > 0) return monthly;
    }
  }

  return [];
}
