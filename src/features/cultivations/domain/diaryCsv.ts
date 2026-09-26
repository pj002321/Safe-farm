import { windDirectionKo } from "@/shared/growth/windText";
import type { CsvValue } from "@/shared/utils/csv";
import { daysBetween } from "./harvestSummary";
import {
  sowingLabelKo,
  type TimelineCultivation,
  type TimelineEntry,
  type TimelineKind,
} from "./timeline";

/**
 * ---------------------------------------------
 * [Feature]: 영농일지를 CSV 표로 (순수)
 *
 * [Description]
 * - 농민이 보조금·인증 서류를 쓸 때 **보고 옮겨 적을** 한 장이다. 제출물이 아니라
 *   참고 자료라, 빈칸이 있어도 "그날은 모름" 으로 읽히면 된다.
 * - **여기는 머리글과 줄만 만든다.** 따옴표·수식 주입·개행은 `shared/utils/csv`
 *   의 `toCsv` 가, BOM 과 내려받기는 `CsvDownloadButton` 이 맡는다. 그쪽이
 *   이미 하는 일을 여기서 또 하면 규칙이 두 벌이 된다.
 *   ⚠ 특히 수식 주입 방어를 직접 하지 말 것 — `toCsv` 는 **숫자로 읽히는 값은
 *     건드리지 않는다.** 직접 막으면 `-3.5` 같은 정상 음수가 글자로 망가진다.
 * - **화면과 순서가 반대다.** 화면은 최신순이고 파일은 **오름차순**(파종 → 수확)
 *   이다. 사람은 서류를 처음부터 끝까지 채우기 때문이다.
 * - **빈칸을 0 으로 채우지 않는다.** `강수 0` 은 "비가 안 왔다" 는 뜻이라, 못 찾은
 *   날과 안 온 날이 같아진다. `null` 은 `toCsv` 가 빈 칸으로 내보낸다.
 *
 * ⚠️ **아직 화면에서 부르지 않는다.** 내보내기 버튼을 잠가 두었다
 *    (`DiaryExportButton`). 칸은 이미 다 저장되고 있으므로 버튼만 열면 된다 —
 *    `taskAdvice.ts` 를 안 쓰이게 두는 것과 같은 결이다. 지우지 말 것.
 *
 * [Usage]
 * ```ts
 * // `cultivation` 은 buildTimeline() 에 넘긴 바로 그 객체를 다시 쓴다
 * const rows = diaryCsvRows(entries, {
 *   cultivation,
 *   stageNames,
 *   plotKo: plot.name,
 *   yieldKg: card.yieldKg,
 * });
 * toCsv(DIARY_CSV_HEADERS, rows);
 * ```
 * ---------------------------------------------
 */

/**
 * 칸 이름과 차례. 농사로 영농일지 폼이 받는 것에 맞췄다.
 *
 * ⚠️ **새 칸은 뒤에 붙인다.** 앞에 끼우면 옮겨 적던 사람의 눈이 한 칸씩 밀린다.
 *    `종류`·`할 일 카드` 만 예외로 앞쪽에 뒀다 — 줄이 무엇인지를 먼저 알아야
 *    나머지 칸을 읽을 수 있어서다.
 *
 * ⚠️ **습도·바람·풍향·일출·일몰은 뒤늦게 더한 것이 아니라 빠져 있던 것이다.**
 *    저장(`cultivation_events`)도 화면(`DiaryDetail`)도 아홉 칸을 다 다루는데
 *    CSV 만 넷이었다 — 아홉 칸이 전부 한 마이그레이션
 *    (`20260920090000_cultivation_events_farm_diary.sql`)에 들어왔는데 이 머리글이
 *    그 전의 세 칸짜리 계획에서 안 따라왔다. 같은 날 커밋이라 티가 안 났다.
 */
export const DIARY_CSV_HEADERS = [
  "날짜",
  "종류",
  "작물",
  "단계",
  "한 일",
  "날씨",
  "할 일 카드",
  "카드 메모",
  "메모",
  "최고",
  "최저",
  "강수",
  "습도",
  "바람",
  "풍향",
  "일출",
  "일몰",
  "조언",
  // ── 여기부터 재배 단위. 줄마다 같은 값이 반복된다 ──
  // 농사로 폼의 `시작일·종료일·필지` 도 원래 그렇게 반복되는 칸이다.
  "텃밭",
  "파종일",
  "종료일",
  "재배일수",
  "수확량(kg)",
] as const;

/**
 * `kind` 를 사람이 읽는 말로.
 *
 * ★ **새로 만드는 자료가 아니라 이름만 옮긴다.** 그래서 이 칸이 공짜다.
 *
 * ⚠️ 카드 제목을 `메모` 칸에 그냥 두면 읽는 사람이 **내가 쓴 메모인지 카드
 *    이름인지 알 수 없다.** 제목 앞에 `<할일카드>` 를 붙이는 길도 있었으나
 *    택하지 않았다 — 칸을 나누면 엑셀에서 `종류` 로 걸러지고, 글자를 섞지 않아
 *    정렬도 안 깨진다.
 */
const KIND_KO: Record<Exclude<TimelineKind, "SOWN">, string> = {
  NOTE: "메모",
  TASK_DONE: "할 일 카드",
  STAGE_SET: "단계 보정",
  STAGE_ADD: "단계 추가",
  FORECAST: "예측",
  HARVESTED: "수확",
  FAILED: "중단",
};

/**
 * 그 줄이 무엇인가. `SOWN` 만 씨/모종을 갈라 적는다.
 *
 * ★ `Exclude<…, "SOWN">` 이라 **컴파일러가 그 예외를 안다.** 주석으로만 적어 두면
 *   `SOWN: "심음"` 같은 도달 불가능한 값이 남아 다음 사람이 그걸 고친다.
 */
function kindKo(
  entry: TimelineEntry,
  cultivation: TimelineCultivation,
): string {
  if (entry.kind !== "SOWN") return KIND_KO[entry.kind];
  // ⚠ `timeline.ts` 와 같은 함수를 부른다 — 같은 줄의 `메모` 칸에 들어가는
  //   제목(`${작물} 씨 뿌림`)이 거기서 나오므로, 두 벌로 적으면 한 줄 안에서
  //   `종류` 와 `메모` 가 서로 다른 말을 한다
  return sowingLabelKo(cultivation.sowingType);
}

export interface DiaryCsvContext {
  /**
   * 이 일지가 딸린 재배. **`buildTimeline()` 에 넘긴 바로 그 객체다.**
   *
   * ⚠️ 낱개 칸(작물·파종일·씨모종·종료일)으로 받지 않는다. 부르는 쪽이 이미 들고
   *    있는 것을 펴서 다시 받으면, `harvested_at ?? failed_at` 같은 규칙이
   *    호출부마다 손으로 적히고 **이 저장소에서 세 번째 사본**이 된다
   *    (`harvestSummary.ts` · `cultivationRecord.ts` 에 이미 둘).
   */
  cultivation: TimelineCultivation;
  /** 단계 번호 → 이름. 화면이 쓰는 것과 같은 표. */
  stageNames: Record<number, string>;
  /** 어느 밭이었나. 재배 자체는 밭 이름을 안 들고 있다. */
  plotKo: string;
  /**
   * 거둔 양(kg). 안 적었으면 `null`.
   *
   * ⚠️ `0` 으로 채우지 않는다 — `수확량 0` 은 흉작이라 **안 적은 것과 같아지면
   *    안 된다.** 종료일·재배일수도 같은 이유로 기르는 중이면 빈 칸이다.
   */
  yieldKg: number | null;
}

function rowOf(
  entry: TimelineEntry,
  ctx: DiaryCsvContext,
): readonly CsvValue[] {
  const w = entry.weather;
  const { cultivation } = ctx;
  // `했음` 으로 담은 줄은 `bodyKo` 가 **카드 제목**이다. 메모가 아니다.
  const 카드줄 = entry.kind === "TASK_DONE";
  // 수확과 중단이 둘 다 찍힌 행은 수확으로 본다(`harvestSummary` 와 같은 판단)
  const 끝난날 = cultivation.harvestedAt ?? cultivation.failedAt;

  return [
    entry.occurredOn,
    kindKo(entry, cultivation),
    cultivation.cropKo,
    entry.stageOrder === null
      ? null
      : (ctx.stageNames[entry.stageOrder] ?? null),
    entry.workKindKo,
    w?.skyKo ?? null,
    // 카드 제목은 제 칸으로. 아래 `메모` 와 섞이면 둘을 가릴 수 없다
    카드줄 ? entry.bodyKo : null,
    // 그 카드에 적은 한 줄. 어느 카드 것인지는 **같은 줄**이 말한다
    entry.taskNoteKo,
    // 파종·수확·중단 줄은 제목이 곧 내용이라 제목을 싣는다. 나머지는 본문.
    카드줄 ? null : (entry.bodyKo ?? entry.titleKo),
    w?.tempMaxC ?? null,
    w?.tempMinC ?? null,
    w?.rainfallMm ?? null,
    w?.humidityPct ?? null,
    w?.windMs ?? null,
    // 도(度)가 아니라 화면과 같은 글자(`북`). 읽는 사람이 방향을 알아야 한다.
    // ⚠ 화면(`DiaryDetail`)도 같은 함수를 쓴다 — 두 벌로 적으면 말이 갈린다
    windDirectionKo(w?.windDirDeg),
    // ⚠ 이미 `"06:06"` 꼴로 저장돼 있다. 자르지 말 것(`timeline.ts` 머리말)
    w?.sunriseAt ?? null,
    w?.sunsetAt ?? null,
    entry.adviceTextKo,
    ctx.plotKo,
    cultivation.sowingDate,
    끝난날,
    // ⚠ **+1 을 하지 않는다.** 마이페이지가 `cultivationDays` 로 이미 그렇게
    //   내보내고 있어 맞춘 것이다. 상세 화면의 `걸린 날`(`harvestSummary.totalDays`)
    //   은 파종 당일을 세서 하루 크다 — 뜻이 다른 숫자다
    끝난날 === null || cultivation.sowingDate === null
      ? null
      : daysBetween(cultivation.sowingDate, 끝난날),
    ctx.yieldKg,
  ];
}

/**
 * 기록을 CSV 줄로. **오름차순**이다.
 *
 * ⚠️ 날짜로 다시 정렬하지 않고 **뒤집는다.** `buildTimeline` 이 날짜뿐 아니라 같은
 *    날 안의 차례(`SAME_DAY_ORDER`)까지 정해서 준다. 날짜만 보고 다시 세우면
 *    정렬이 안정적이라 **그날 줄만 최신순으로 남아** 오름차순 파일 안에서 거꾸로
 *    선다. 뒤집기는 둘을 한꺼번에 뒤집는다.
 */
export function diaryCsvRows(
  entries: readonly TimelineEntry[],
  ctx: DiaryCsvContext,
): readonly (readonly CsvValue[])[] {
  return [...entries].reverse().map((entry) => rowOf(entry, ctx));
}

/**
 * 한 번에 내보낼 수 있는 재배 수.
 *
 * 주소 길이(`?id=` 가 재배마다 41자)와 조회·파일 크기를 함께 막는다. 200 까지도
 * 돌지만 **일부러 넉넉하게 100 으로 잡았다** — 한 해 재배가 100건을 넘는 경우가
 * 드물고, 넘을 땐 연도로 나눠 받는 편이 파일도 다루기 쉽다(2026-09-22 결정).
 *
 * ⚠️ 화면(`RecordPanel` 의 경고문)과 라우트(거절)가 **같은 값을 봐야 한다.**
 *    두 벌로 적으면 "받을 수 있다" 고 해 놓고 서버가 거절하는 일이 생긴다.
 */
export const DIARY_EXPORT_MAX = 100;

/** 공백과 구분자는 파일 이름에서 골치라 밑줄로 바꾼다. */
function safeName(value: string): string {
  return value.replace(/[\s,/\\]+/g, "_");
}

/** 내려받을 때 쓸 이름 — **한 건**(재배 상세). */
export function diaryCsvFileName(cropKo: string, plotNameKo: string): string {
  return `영농일지_${safeName(cropKo)}_${safeName(plotNameKo)}.csv`;
}

/**
 * 내려받을 때 쓸 이름 — **여러 건**(마이페이지에서 고른 것).
 *
 * ⚠️ 한 건짜리와 **같은 파일에 둔다.** 이름 규칙이 라우트 안 템플릿 리터럴로
 *    흩어지면 한쪽만 고쳐져 화면마다 다른 이름이 나온다. 여기 있으면 순수 함수라
 *    테스트도 붙는다(이 저장소는 순수 함수만 테스트한다).
 *
 * ⚠️ `year` 는 **주소에서 온 값**이라 그대로 믿지 않는다. 밑줄로 바꾸는 규칙을
 *    한 건짜리와 똑같이 태운다.
 */
export function diaryCsvBundleName(year: string | null, count: number): string {
  return `영농일지_${year ? safeName(year) : "전체"}_${count}건.csv`;
}
