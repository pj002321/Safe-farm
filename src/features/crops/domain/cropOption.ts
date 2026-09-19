import {
  MATURITY_LABEL_KO,
  MATURITY_TYPES,
  type MaturityType,
} from "@/shared/growth/maturity";
import { isTransplantMethod } from "@/shared/growth/transplant";

/**
 * ---------------------------------------------
 * [Feature]: 작물 마스터 행 → 선택 카드 값 (순수 함수)
 *
 * [Description]
 * - `CropCards` 에 박혀 있던 상수를 DB 조회로 바꾸면서, 행을 화면이 쓸 모양으로
 *   좁히는 자리가 필요해졌다. `plotSummary.ts` 의 `toPlotCard` 와 같은 역할이다.
 * - 난이도는 DB 가 한글("쉬움")로 들고 있다. 점 개수로 그리려면 숫자가 필요한데,
 *   그 변환을 컴포넌트에서 하면 테스트할 자리가 없어진다.
 * - 재배 기간은 `crops` 가 아니라 `crop_variants.days_to_harvest` 에 있다.
 *   한 작물에 품종이 여럿이라 값도 여럿이므로 범위로 접는다.
 * ---------------------------------------------
 */

/** 숙기 한 갈래. 화면이 라디오 한 칸을 그리는 데 쓴다. */
export interface MaturityOption {
  type: MaturityType;
  /** "조생종" · "중생종" · "만생종" */
  labelKo: string;
  /** 이 숙기만의 재배 일수. 없으면 null — 라벨에 일수를 안 적는다. */
  daysToHarvest: number | null;
}

export interface CropOption {
  cropId: number;
  nameKo: string;
  /** 1=쉬움 2=보통 3=어려움. 점 개수로 그린다. */
  difficultyLevel: 1 | 2 | 3;
  difficultyKo: string;
  /** "약 80일" · "80~95일". 품종이 없으면 null — 화면이 자리를 비운다. */
  durationKo: string | null;
  /**
   * 고를 수 있는 숙기. **조·중·만 차례로** 정렬돼 있다.
   *
   * 길이가 2 이상일 때만 화면이 라디오를 띄운다 — 2026-09-18 기준 89작물 중 23개다.
   * 하나뿐인 56작물에 "중생종" 한 칸짜리 선택지를 띄우면 고를 것도 없는 칸이 화면을 채운다.
   */
  maturities: MaturityOption[];
  /**
   * 씨앗으로 심을 때 · 모종으로 심을 때의 안내 문장. "3.1~3.20에 씨를 뿌립니다" 꼴이다.
   * 없으면 null — 화면이 "정보 없음" 대신 자리를 비운다. 지역 보정은 아직 없다(V1-22).
   *
   * ⚠️ 예전에는 창이 하나였다(`sowingWindowKo`). 벼가 그 한 칸에 안 들어가서 갈랐다 —
   *   못자리 4.11~5.20 과 모내기 5.15~6.15 는 한 달 떨어져 있는데, 한 칸이던 시절엔
   *   둘 중 하나만 남아 모종을 고른 사람에게 못자리 날짜를 안내했다.
   * ⚠️ 둘 중 하나만 있는 것이 정상이다 —
   * 직파 작물(감자·시금치)은 `plantWindowKo` 가, 씨로 안 심는 작물(딸기)은 `seedWindowKo` 가 null.
   */
  seedWindowKo: string | null;
  plantWindowKo: string | null;
  /** 오늘이 파종 창 안인가. 카드에 "지금 심기 좋음" 배지를 띄운다. */
  sowingNow: boolean;
}

export interface CropOptionRow {
  crop_id: number;
  name: string;
  difficulty: string | null;
  /** Supabase 조인 결과. 품종이 없으면 빈 배열이다. */
  crop_variants: {
    maturity_type: string | null;
    days_to_harvest: number | null;
    sow_method: string | null;
    sow_from: string | null;
    sow_to: string | null;
    seed_from: string | null;
    seed_to: string | null;
    plant_from: string | null;
    plant_to: string | null;
  }[];
}

/**
 * `todayMmDd` 를 인자로 받는 까닭: 안에서 `new Date()` 를 부르면 테스트가 돌리는
 * 날짜에 흔들리고, 서버에서 UTC 로 잘리면 한국 자정 근처에 하루가 어긋난다.
 * 호출자(`cropStore`)가 `kstDateString()` 으로 만들어 넘긴다.
 */
export function toCropOption(
  row: CropOptionRow,
  todayMmDd: string,
): CropOption {
  return {
    cropId: row.crop_id,
    nameKo: row.name,
    difficultyLevel: toDifficultyLevel(row.difficulty),
    difficultyKo: row.difficulty ?? "보통",
    durationKo: toDurationKo(row.crop_variants),
    maturities: toMaturities(row.crop_variants),
    // 같은 함수를 창만 바꿔 두 번 부른다. 서술어는 방법이 정한다 —
    // 씨 쪽은 늘 "씨를 뿌립니다", 옮 쪽은 작물에 따라 "모내기 합니다"·"모종으로 심습니다"
    seedWindowKo: toSowingWindowKo(
      row.crop_variants.map((v) => ({
        sow_method: "씨뿌림",
        sow_from: v.seed_from,
        sow_to: v.seed_to,
      })),
    ),
    plantWindowKo: toSowingWindowKo(
      row.crop_variants.map((v) => ({
        sow_method: toPlantMethod(v.sow_method),
        sow_from: v.plant_from,
        sow_to: v.plant_to,
      })),
    ),
    // ⚠️ 씨 창·옮 창을 **둘 다** 본다. 배지는 카드 맨 위에 하나뿐이라 씨앗/모종
    //   라디오보다 먼저 그려지고, 어느 쪽을 고를지 아직 모른다.
    //   `sow_*` 하나만 보던 시절엔 아래 안내 문구와 어긋났다 — 양파가 9월에
    //   "8.11~9.20에 씨를 뿌립니다" 를 띄우면서 배지는 꺼져 있었다(sow_* 는 10.11~11.20).
    //   2026-09-19 실측으로 seed_* 13숙기 · plant_* 35숙기가 sow_* 와 다르다.
    sowingNow: isSowingSeason(todayMmDd, [
      ...row.crop_variants,
      ...row.crop_variants.map((v) => ({
        sow_from: v.seed_from,
        sow_to: v.seed_to,
      })),
      ...row.crop_variants.map((v) => ({
        sow_from: v.plant_from,
        sow_to: v.plant_to,
      })),
    ]),
  };
}

/**
 * 한글 난이도 → 점 개수.
 *
 * 모르는 값은 "보통"으로 본다. 난이도 한 칸이 틀렸다고 카드를 못 그릴 이유는 없다.
 */
export function toDifficultyLevel(difficulty: string | null): 1 | 2 | 3 {
  if (difficulty === "쉬움") return 1;
  if (difficulty === "어려움") return 3;
  return 2;
}

/**
 * 품종별 재배 일수를 한 줄로 접는다.
 *
 * 품종이 하나면 "약 80일", 여럿이면 "80~95일". 값이 다 비면 null 을 돌려주고
 * 화면이 그 자리를 비운다 — "약 0일"이 나가면 사실이 아니다.
 */
export function toDurationKo(
  variants: readonly { days_to_harvest: number | null }[],
): string | null {
  const days = variants
    .map((v) => v.days_to_harvest)
    .filter((d): d is number => typeof d === "number" && d > 0);

  if (days.length === 0) return null;

  const min = Math.min(...days);
  const max = Math.max(...days);
  return min === max ? `약 ${min}일` : `${min}~${max}일`;
}

/**
 * 고를 수 있는 숙기를 조·중·만 차례로.
 *
 * ⚠️ **`crop_variants` 가 준 차례를 믿지 않는다.** Supabase 조인 결과의 순서는 보장이 없고,
 *   설령 `variant_id` 순이어도 그것이 조·중·만 순이라는 근거가 없다. 코드가 차례를 정한다.
 * ⚠️ 모르는 숙기 값은 버린다. 화면에 라디오를 그려야 하는데 이름을 붙일 수 없어서다 —
 *   DB CHECK 가 셋만 받으므로 실제로는 안 들어온다.
 *   차례·라벨은 `shared/growth/maturity.ts` 하나에서 온다 — 여기에 다시 적지 않는다.
 */
export function toMaturities(
  variants: readonly {
    maturity_type: string | null;
    days_to_harvest: number | null;
  }[],
): MaturityOption[] {
  return MATURITY_TYPES.flatMap((type) => {
    const found = variants.find((v) => v.maturity_type === type);
    if (!found) return [];
    return [
      {
        type,
        labelKo: MATURITY_LABEL_KO[type],
        daysToHarvest: found.days_to_harvest,
      },
    ];
  });
}

/** `crop_variants` 의 파종 창 세 칸. `MM-DD` 문자열이고 연도가 없다. */
interface SowingWindow {
  sow_method: string | null;
  sow_from: string | null;
  sow_to: string | null;
}

/**
 * 옮 쪽 창을 설명할 때 쓸 작업명.
 *
 * `sow_method` 는 §A 가 고른 **대표 작업 하나**라, 작물에 따라 씨 쪽 낱말이 온다 —
 * 벼가 '모기르기' 다. 그 말로 옮 창(5.15~6.15)을 설명하면 "모를 기르기 시작합니다"
 * 가 되어 앞뒤가 뒤집힌다. 옮 창은 **정의상 옮겨 심는 때**이므로, 옮겨심기 낱말이
 * 아니면 '아주심기' 로 갈아 끼운다.
 *
 * ⚠️ 그래서 벼도 "모종으로 심습니다" 로 나온다. 농사짓는 사람의 말은 '모내기' 지만,
 *   그 낱말은 지금 `crop_stages` 의 단계 이름에만 있고 `crop_variants` 에는 없다.
 *   작물 이름을 박아 가르지 않는다 — 고치려면 마스터에 옮 쪽 작업명을 따로 실어야 한다.
 */
function toPlantMethod(method: string | null): string {
  const m = (method ?? "").trim();
  // 낱말표는 shared/growth/transplant.ts 하나에서 온다 — 여기에 다시 적지 않는다.
  // 예전에는 여기와 seedlingStart.ts 가 목록을 따로 들고 있었고 서로 달랐다.
  return isTransplantMethod(m) ? m : "아주심기";
}

/**
 * 파종 방법을 사람 말로. `<기간>에 ~` 뒤에 붙는 서술어다.
 *
 * 마스터의 `sow_method` 는 농업 용어라 그대로 보이면 초보자가 모른다 —
 * "아주심기" 는 모종을 밭에 옮겨 심는 것이고, 화면에 그 말을 띄우면 뜻이 안 통한다.
 *
 * ⚠️ 2026-09-18 실측으로 값이 여덟이다(화면에 나오는 89작물 기준).
 *     씨뿌림 62 · 파종 20 · 아주심기 19 · 빈값 16 · 모내기 3 · 육묘 1 · 인공수분 1 · 모 기르기 1
 *   `인공수분`(참다래)은 **파종이 아니라 꽃가루받이다.** "심습니다" 로 뭉뚱그리면 틀린 말이 된다.
 *   빈 값(과수 대부분)은 방법을 모르는 것이므로 중립적으로 "심습니다" 로 둔다.
 *
 * 모르는 값이 새로 들어오면 그 말을 그대로 쓴다 — 지어내는 것보다 낫다.
 */
function toSowingPhrase(method: string | null): string {
  switch ((method ?? "").trim()) {
    case "아주심기":
    case "정식":
      return "모종으로 심습니다";
    case "씨뿌림":
    case "파종":
      return "씨를 뿌립니다";
    case "모내기":
      return "모내기 합니다";
    case "육묘":
    case "모 기르기":
    case "모기르기":
      return "모를 기르기 시작합니다";
    case "인공수분":
      return "인공수분을 합니다";
    case "":
      return "심습니다";
    default:
      return `${method}을(를) 합니다`;
  }
}

/**
 * 품종별 파종 창을 한 문장으로. "3.1~3.31에 씨를 뿌립니다" 꼴이다.
 *
 * `MM-DD` 를 "3.1" 로 줄이고, 여러 품종이면 가장 이른 시작 ~ 가장 늦은 끝.
 * 값이 없으면 null — "권장 시기: 정보 없음" 을 띄우는 대신 자리를 비운다.
 *
 * ⚠️ 해를 넘는 창은 `sow_to < sow_from` 으로 표시된다(셀러리 12-01~02-28).
 *   그대로 "12.1~2.28" 로 적는다 — 그게 사실이다.
 * ⚠️ 그런 창이 다른 품종과 섞이면 `sort()` 로 고른 양 끝이 뒤집힌다. 지금 그런
 *   작물(셀러리·덴드로비움)은 품종이 하나뿐이라 안 걸린다. 둘 이상은 미지원이다.
 */
export function toSowingWindowKo(
  variants: readonly SowingWindow[],
): string | null {
  const rows = variants.filter((v) => v.sow_from && v.sow_to);
  if (rows.length === 0) return null;

  const short = (mmdd: string) =>
    `${Number(mmdd.slice(0, 2))}.${Number(mmdd.slice(3, 5))}`;
  const from = rows.map((v) => v.sow_from as string).sort()[0] as string;
  const to = rows
    .map((v) => v.sow_to as string)
    .sort()
    .at(-1) as string;
  return `${short(from)}~${short(to)}에 ${toSowingPhrase(rows[0].sow_method)}`;
}

/**
 * 오늘이 이 작물의 파종 창 안인가. 품종 여럿이면 하나라도 안이면 참.
 *
 * 해넘김은 `to < from` 으로 판정한다 — "12-01"~"02-28" 이면 12·1·2월이 안이다.
 * 연도가 없는 `MM-DD` 문자열이라 사전순 비교가 곧 날짜 비교다.
 */
export function isSowingSeason(
  todayMmDd: string,
  variants: readonly Pick<SowingWindow, "sow_from" | "sow_to">[],
): boolean {
  return variants.some(({ sow_from: from, sow_to: to }) => {
    if (!from || !to) return false;
    return from <= to
      ? from <= todayMmDd && todayMmDd <= to
      : todayMmDd >= from || todayMmDd <= to;
  });
}
