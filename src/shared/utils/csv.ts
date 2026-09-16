/**
 * ---------------------------------------------
 * [Feature]: CSV 직렬화 (RFC 4180)
 *
 * [Description]
 * - 표 하나를 CSV 문자열로 바꾸는 **순수 함수**다. DOM·fetch·환경변수를 읽지
 *   않으므로 vitest 로 그대로 검증된다(이 저장소는 순수 함수만 테스트한다).
 * - 줄바꿈은 RFC 4180 대로 `\r\n`. 필드 안에 들어간 `\n` 과 레코드 구분자를
 *   섞어 쓰면 파서가 갈라지므로 구분자 쪽을 CRLF 로 고정한다.
 * - **BOM 은 여기서 붙이지 않는다.** 붙이는 자리는 파일을 만드는 쪽
 *   (`downloadCsv` 혹은 Route Handler) 한 곳이다. 문자열 자체에 섞으면
 *   테스트마다 `\uFEFF` 를 달고 다녀야 하고, CSV 를 화면에 미리보기로 쓰는
 *   순간 보이지 않는 글자가 앞에 붙는다.
 * - 수식 주입(CSV injection)을 막되 `-3.5` 같은 **정상 음수는 건드리지 않는다.**
 *   판단 기준은 "숫자로 읽히는가" 하나다(아래 `neutralize` 주석).
 *
 * [Usage]
 * ```ts
 * toCsv(
 *   ["연도", "텃밭", "작물", "수확량(kg)"],
 *   [[2026, "낙동강변 논", "벼", 412.5]],
 * );
 * // '연도,텃밭,작물,수확량(kg)\r\n2026,낙동강변 논,벼,412.5\r\n'
 * ```
 * ---------------------------------------------
 */

/** 셀에 넣을 수 있는 값. `null`·`undefined` 는 빈 칸으로 나간다. */
export type CsvValue = string | number | boolean | null | undefined;

const NEEDS_QUOTE = /[",\r\n]/;

/**
 * Excel·LibreOffice 가 셀 내용을 **수식으로 실행**하는 시작 문자들.
 *
 * 따옴표로 감싸도 막히지 않는다 — 파서가 따옴표를 벗겨낸 뒤 값을 평가하기
 * 때문이다. 그래서 값 자체를 바꾸는 수밖에 없다(OWASP CSV Injection).
 * 탭·CR 이 포함된 이유는 Excel 이 앞쪽 공백을 버리고 그다음 글자부터 읽기 때문.
 */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/**
 * 한 필드를 RFC 4180 규칙으로 감싼다.
 *
 * - `,` `"` `CR` `LF` 중 하나라도 있으면 전체를 `"` 로 감싸고, 안의 `"` 는 `""` 로 겹친다.
 * - 그 외에는 그대로 둔다. 전부 감싸도 규격상 맞지만 파일이 커지고 눈으로 읽기 나쁘다.
 */
function quote(field: string): string {
  if (!NEEDS_QUOTE.test(field)) return field;
  return `"${field.replaceAll('"', '""')}"`;
}

/**
 * 수식 주입 무력화.
 *
 * **숫자로 읽히면 손대지 않는다.** `-3.5`, `+12`, `-0` 은 전부 `Number.isFinite`
 * 를 통과하므로 원본 그대로 나간다 — 값을 망가뜨리지 않는다는 요구가 여기서 지켜진다.
 * 숫자가 아닌데 `=`·`@`·`-` 로 시작하는 값(사용자가 입력한 텃밭 이름·메모)에만
 * 작은따옴표를 앞에 붙인다. 엑셀은 이걸 "텍스트로 취급" 표식으로 읽고 화면에는
 * 원문을 보여준다.
 *
 * 숫자 타입(`number`)은 애초에 이 함수를 타지 않는다 — 우리가 만든 값이라 안전하다.
 */
function neutralize(field: string): string {
  if (!FORMULA_LEAD.test(field)) return field;
  if (Number.isFinite(Number(field))) return field;
  return `'${field}`;
}

function cell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    // NaN·Infinity 를 "NaN" 으로 흘리지 않는다. 빈 칸이 "값 없음"의 정직한 표현이다.
    return Number.isFinite(value) ? String(value) : "";
  }
  if (typeof value === "boolean") return value ? "예" : "아니오";
  return quote(neutralize(value));
}

/**
 * 머리글 한 줄 + 데이터 여러 줄을 CSV 문자열로 만든다.
 *
 * 마지막 줄에도 `\r\n` 을 붙인다. 파일 끝 개행은 RFC 4180 에서 선택이지만,
 * 붙여 두면 다른 파일과 이어 붙일 때 줄이 엉키지 않는다.
 */
export function toCsv(
  headers: readonly string[],
  rows: readonly (readonly CsvValue[])[],
): string {
  const lines = [headers.map(cell), ...rows.map((row) => row.map(cell))];
  return `${lines.map((line) => line.join(",")).join("\r\n")}\r\n`;
}
