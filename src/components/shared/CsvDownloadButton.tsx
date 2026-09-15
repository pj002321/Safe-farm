"use client";

import { Button } from "@/components/shared/Button";
import { type CsvValue, toCsv } from "@/shared/utils/csv";

/**
 * ---------------------------------------------
 * [Feature]: CSV 내려받기 버튼
 *
 * [Description]
 * - 표 데이터를 눌렀을 때 CSV 파일로 저장한다. **직렬화는 `toCsv` 가**,
 *   이 파일은 브라우저에 파일을 건네는 일만 한다 — 그래야 규칙을 vitest 로
 *   검증할 수 있다(이 저장소는 순수 함수만 테스트한다).
 * - `Button` 을 그대로 쓴다. 다운로드라고 해서 다른 옷을 입힐 이유가 없다.
 * - **BOM(`\uFEFF`) 을 여기서 딱 한 번 붙인다.** 없으면 Windows 엑셀이 파일을
 *   현재 코드 페이지(한국어 Windows 는 CP949)로 읽어 한글이 전부 깨진다.
 *   엑셀은 UTF-8 을 자동 감지하지 않는다 — BOM 이 유일한 신호다.
 * - 클릭한 순간에 만든다. 화면을 그릴 때 미리 만들면 한 번도 누르지 않는
 *   사용자의 시간까지 쓰게 된다.
 *
 * [Usage]
 * ```tsx
 * <CsvDownloadButton
 *   filename="재배기록_2026.csv"
 *   headers={["연도", "텃밭", "작물"]}
 *   rows={records.map((r) => [r.year, r.plotName, r.cropKo])}
 * >
 *   CSV 내려받기
 * </CsvDownloadButton>
 * ```
 * ---------------------------------------------
 */

interface CsvDownloadButtonProps {
  /** 한글 파일명도 그대로 쓴다. `download` 속성은 DOMString 이라 인코딩 문제가 없다. */
  filename: string;
  headers: readonly string[];
  rows: readonly (readonly CsvValue[])[];
  children: string;
}

export function CsvDownloadButton({
  filename,
  headers,
  rows,
  children,
}: CsvDownloadButtonProps) {
  function handleClick() {
    // BOM 을 별도 조각으로 넘긴다. 문자열을 이어 붙이는 것과 결과는 같지만
    // "파일 앞머리 표식"이라는 의도가 그대로 읽힌다.
    const blob = new Blob(["\uFEFF", toCsv(headers, rows)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;

    // 문서에 붙였다 떼는 이유: Firefox 와 구형 Safari 는 문서에 없는 <a> 의
    // click() 을 무시한다. Chrome 만 보고 만들면 이 두 곳에서 조용히 실패한다.
    document.body.append(anchor);
    anchor.click();
    anchor.remove();

    // Blob 은 revoke 하기 전까지 메모리에 남는다(탭을 닫을 때까지). 다만 같은
    // 틱에서 해제하면 Safari 가 저장을 시작하기 전에 URL 이 사라져 다운로드가
    // 취소된다. 한 틱 뒤로 미루는 것이 두 문제를 한 번에 푸는 자리다.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <Button
      disabled={rows.length === 0}
      onClick={handleClick}
      size="sm"
      variant="outline"
    >
      {children}
    </Button>
  );
}
