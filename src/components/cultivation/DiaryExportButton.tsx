import { Button } from "@/components/shared/Button";

/**
 * ---------------------------------------------
 * [Feature]: 영농일지 내보내기 — **잠가 둔 버튼**
 *
 * [Description]
 * - 농민이 보조금·인증 서류를 쓸 때 한 철치를 한눈에 보려면 파일이 편하다.
 *   줄을 만드는 쪽(`domain/diaryCsv.ts`)은 다 됐고 테스트도 있다.
 * - ⚠️ **일부러 못 누르게 뒀다.** 영농일지 자체가 아직 팀 합의 전이라, 값을
 *   쌓는 것까지만 하고 꺼내는 길은 닫아 둔다. 칸은 전부 저장되고 있으므로
 *   나중에 여는 데 마이그레이션도 자료 보정도 필요 없다.
 * - 이 자리는 **`CsvDownloadButton` 으로 갈아 끼운다.** 직렬화·BOM·내려받기는
 *   그쪽이 이미 다 한다 — 여기서 다시 만들지 말 것.
 *
 * ### 열 때 할 일
 * ```tsx
 * <CsvDownloadButton
 *   filename={diaryCsvFileName(cropKo, plotNameKo)}
 *   headers={DIARY_CSV_HEADERS}
 *   rows={diaryCsvRows(entries, { cropKo, stageNames })}
 * >
 *   파일로 내려받기
 * </CsvDownloadButton>
 * ```
 * 그 컴포넌트가 `"use client"` 라, 여는 순간 이 화면에 처음으로 클라이언트
 * 코드가 들어온다. 버튼이 잠겨 있는 동안에는 **JS 가 0줄**로 유지된다.
 * ---------------------------------------------
 */

export function DiaryExportButton() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Button disabled size="sm" variant="outline">
        파일로 내려받기
      </Button>
      <span className="text-fg-subtle text-xs">준비 중입니다</span>
    </div>
  );
}
