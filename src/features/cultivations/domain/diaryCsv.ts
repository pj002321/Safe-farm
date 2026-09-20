import type { TimelineEntry } from "./timeline";

/**
 * ---------------------------------------------
 * [Feature]: 영농일지 CSV 만들기 (순수)
 *
 * [Description]
 * - 농민이 보조금·인증 서류를 쓸 때 **보고 옮겨 적을** 한 장이다. 제출물이 아니라
 *   참고 자료라, 빈칸이 있어도 "그날은 모름" 으로 읽히면 된다.
 * - **화면과 순서가 반대다.** 화면은 최신순이고 여기는 **오름차순**(파종 → 수확)
 *   이다. 사람은 서류를 처음부터 끝까지 채우기 때문이다. 화면을 어떻게 보고
 *   있었는지에 파일 순서가 달리면 안 되므로 **여기서 늘 다시 세운다.**
 * - **빈칸을 0 으로 채우지 않는다.** `강수 0` 은 "비가 안 왔다" 는 뜻이라, 못 찾은
 *   날과 안 온 날이 같아진다.
 *
 * ⚠️ **아직 화면에서 부르지 않는다.** 내보내기 버튼은 잠가 두었다
 *    (`DiaryExportButton`). 칸은 이미 다 저장되고 있으므로 버튼만 열면 된다 —
 *    `taskAdvice.ts` 를 안 쓰이게 두는 것과 같은 결이다. 지우지 말 것.
 *
 * [Usage]
 * ```ts
 * const csv = buildDiaryCsv(entries, { cropKo: "양파", stageNames });
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

/**
 * 엑셀이 글자를 수식으로 읽지 않게 막는다.
 *
 * ⚠️ `=` `+` `-` `@` 로 시작하는 칸을 엑셀은 **수식으로** 연다. 자기 파일이면
 *    별일 아니지만 이 파일은 조합·공무원에게 건네질 수 있다. 앞에 작은따옴표를
 *    붙이면 엑셀이 글자로 읽는다.
 */
function defuse(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

/** 큰따옴표·쉼표·줄바꿈이 들어 있으면 감싸고, 안의 큰따옴표는 두 개로. */
function cell(value: string | number | null): string {
  if (value === null) return "";
  const text = defuse(String(value));
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function rowOf(entry: TimelineEntry, ctx: DiaryCsvContext): string {
  const stageKo =
    entry.stageOrder === null
      ? null
      : (ctx.stageNames[entry.stageOrder] ?? null);
  const weather = entry.weather;

  return [
    entry.occurredOn,
    ctx.cropKo,
    stageKo,
    entry.workKindKo,
    weather?.skyKo ?? null,
    // 파종·수확·중단 줄은 제목이 곧 내용이라 제목을 싣는다. 나머지는 본문.
    entry.bodyKo ?? entry.titleKo,
    weather?.tempMaxC ?? null,
    weather?.tempMinC ?? null,
    weather?.rainfallMm ?? null,
    entry.adviceTextKo,
  ]
    .map(cell)
    .join(",");
}

/**
 * 기록을 CSV 한 장으로. 줄은 **오름차순**이다.
 *
 * ⚠️ **맨 앞에 U+FEFF 한 글자를 붙인다.** 없으면 엑셀이 시스템 코드페이지(cp949)로
 *    읽어 한글이 전부 깨진다. 눈에 안 보이는 글자라 코드에 직접 적지 않고
 *    `String.fromCharCode` 로 만든다 — 편집기가 조용히 지운다.
 */
export function buildDiaryCsv(
  entries: readonly TimelineEntry[],
  ctx: DiaryCsvContext,
): string {
  const BOM = String.fromCharCode(0xfeff);
  const ascending = [...entries].toSorted((a, b) =>
    a.occurredOn.localeCompare(b.occurredOn),
  );

  return (
    BOM +
    [
      DIARY_CSV_HEADERS.join(","),
      ...ascending.map((entry) => rowOf(entry, ctx)),
    ].join("\r\n")
  );
}

/** 내려받을 때 쓸 이름. 공백과 쉼표는 파일 이름에서 골치라 밑줄로 바꾼다. */
export function diaryCsvFileName(cropKo: string, plotNameKo: string): string {
  const safe = (value: string) => value.replace(/[\s,/\\]+/g, "_");
  return `영농일지_${safe(cropKo)}_${safe(plotNameKo)}.csv`;
}
