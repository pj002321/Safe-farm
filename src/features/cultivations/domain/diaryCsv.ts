import type { CsvValue } from "@/shared/utils/csv";
import type { TimelineEntry } from "./timeline";

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
 * const rows = diaryCsvRows(entries, { cropKo: "양파", stageNames });
 * toCsv(DIARY_CSV_HEADERS, rows);
 * ```
 * ---------------------------------------------
 */

/** 칸 이름과 차례. 농사로 영농일지 폼이 받는 것에 맞췄다. */
export const DIARY_CSV_HEADERS = [
  "날짜",
  "작물",
  "단계",
  "한 일",
  "날씨",
  "메모",
  "카드 메모",
  "최고",
  "최저",
  "강수",
  "조언",
] as const;

export interface DiaryCsvContext {
  cropKo: string;
  /** 단계 번호 → 이름. 화면이 쓰는 것과 같은 표. */
  stageNames: Record<number, string>;
}

function rowOf(
  entry: TimelineEntry,
  ctx: DiaryCsvContext,
): readonly CsvValue[] {
  const w = entry.weather;

  return [
    entry.occurredOn,
    ctx.cropKo,
    entry.stageOrder === null
      ? null
      : (ctx.stageNames[entry.stageOrder] ?? null),
    entry.workKindKo,
    w?.skyKo ?? null,
    // 파종·수확·중단 줄은 제목이 곧 내용이라 제목을 싣는다. 나머지는 본문.
    entry.bodyKo ?? entry.titleKo,
    // `했음` 줄에만 있다. 위 칸에는 카드 제목이 들어가 있어 자리를 나눈다.
    entry.taskNoteKo,
    w?.tempMaxC ?? null,
    w?.tempMinC ?? null,
    w?.rainfallMm ?? null,
    entry.adviceTextKo,
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

/** 내려받을 때 쓸 이름. 공백과 구분자는 파일 이름에서 골치라 밑줄로 바꾼다. */
export function diaryCsvFileName(cropKo: string, plotNameKo: string): string {
  const safe = (value: string) => value.replace(/[\s,/\\]+/g, "_");
  return `영농일지_${safe(cropKo)}_${safe(plotNameKo)}.csv`;
}
