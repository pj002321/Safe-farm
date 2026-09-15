import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv — RFC 4180 따옴표 규칙", () => {
  it("아무 문자도 없으면 감싸지 않는다", () => {
    expect(toCsv(["a", "b"], [["1", "2"]])).toBe("a,b\r\n1,2\r\n");
  });

  it("쉼표가 든 필드는 따옴표로 감싼다", () => {
    expect(toCsv(["작물"], [["배추, 무"]])).toBe('작물\r\n"배추, 무"\r\n');
  });

  it("따옴표는 두 번 겹쳐 쓰고 전체를 감싼다", () => {
    expect(toCsv(["메모"], [['그는 "좋다"고 했다']])).toBe(
      '메모\r\n"그는 ""좋다""고 했다"\r\n',
    );
  });

  it("줄바꿈(LF·CRLF·CR)이 든 필드는 감싼다 — 레코드가 갈라지면 안 된다", () => {
    expect(toCsv(["메모"], [["첫줄\n둘째줄"]])).toBe(
      '메모\r\n"첫줄\n둘째줄"\r\n',
    );
    expect(toCsv(["메모"], [["첫줄\r\n둘째줄"]])).toBe(
      '메모\r\n"첫줄\r\n둘째줄"\r\n',
    );
  });

  it("레코드 구분자는 항상 CRLF 이고 마지막 줄에도 붙는다", () => {
    expect(toCsv(["a"], [["1"], ["2"]])).toBe("a\r\n1\r\n2\r\n");
  });
});

describe("toCsv — 수식 주입", () => {
  it("=, +, @, 탭으로 시작하는 텍스트는 작은따옴표로 중화한다", () => {
    expect(toCsv(["이름"], [["=1+1"]])).toBe("이름\r\n'=1+1\r\n");
    expect(toCsv(["이름"], [["@SUM(A1)"]])).toBe("이름\r\n'@SUM(A1)\r\n");
    expect(toCsv(["이름"], [["=cmd|'/c calc'!A0"]])).toBe(
      `이름\r\n'=cmd|'/c calc'!A0\r\n`,
    );
    // 탭으로 시작하면 엑셀이 공백을 버리고 다음 글자부터 읽는다.
    expect(toCsv(["이름"], [["\t=1+1"]])).toBe("이름\r\n'\t=1+1\r\n");
    // 수식이면서 쉼표까지 든 값은 중화 + 따옴표 감싸기가 둘 다 걸린다.
    expect(toCsv(["이름"], [["=A1,B1"]])).toBe(`이름\r\n"'=A1,B1"\r\n`);
  });

  it("정상 음수·양수는 절대 건드리지 않는다", () => {
    expect(toCsv(["기온"], [["-3.5"]])).toBe("기온\r\n-3.5\r\n");
    expect(toCsv(["기온"], [["+12"]])).toBe("기온\r\n+12\r\n");
    expect(toCsv(["기온"], [[-3.5]])).toBe("기온\r\n-3.5\r\n");
    expect(toCsv(["증감"], [["-0.0"]])).toBe("증감\r\n-0.0\r\n");
  });

  it("숫자로 읽히지 않는 하이픈 시작 값은 중화한다", () => {
    expect(toCsv(["기간"], [["-3일차"]])).toBe("기간\r\n'-3일차\r\n");
  });
});

describe("toCsv — 빈 값·유니코드", () => {
  it("null·undefined·빈 문자열은 빈 칸", () => {
    expect(toCsv(["a", "b", "c"], [[null, undefined, ""]])).toBe(
      "a,b,c\r\n,,\r\n",
    );
  });

  it("행이 하나도 없으면 머리글만 남는다", () => {
    expect(toCsv(["연도", "작물"], [])).toBe("연도,작물\r\n");
  });

  it("NaN·Infinity 는 빈 칸으로 흘린다", () => {
    expect(toCsv(["수확량"], [[Number.NaN, Number.POSITIVE_INFINITY]])).toBe(
      "수확량\r\n,\r\n",
    );
  });

  it("한글·이모지·결합문자를 그대로 보존한다", () => {
    expect(toCsv(["작물"], [["배추🥬"], ["한글"]])).toBe(
      "작물\r\n배추🥬\r\n한글\r\n",
    );
  });

  it("불리언은 한국어로 낸다", () => {
    expect(toCsv(["직파"], [[true], [false]])).toBe("직파\r\n예\r\n아니오\r\n");
  });
});
