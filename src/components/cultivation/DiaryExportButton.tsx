/**
 * ---------------------------------------------
 * [Feature]: 영농일지 내보내기 — **잠가 둔 버튼**
 *
 * [Description]
 * - 농민이 보조금·인증 서류를 쓸 때 한 철치를 한눈에 보려면 파일이 편하다.
 *   만드는 쪽(`domain/diaryCsv.ts`)은 다 됐고 테스트도 있다.
 * - ⚠️ **일부러 못 누르게 뒀다.** 영농일지 자체가 아직 팀 합의 전이라, 값을
 *   쌓는 것까지만 하고 꺼내는 길은 닫아 둔다. 칸은 전부 저장되고 있으므로
 *   나중에 여는 데 마이그레이션도 자료 보정도 필요 없다.
 * - ⚠️ **열 때 이 파일이 Client Component 가 된다.** 지금 재배 상세 화면은
 *   JS 가 한 줄도 없다(폼·정렬 전부 서버가 그린다). 파일 내려받기는 브라우저가
 *   해야 해서, 여는 순간 이 화면에 처음으로 클라이언트 코드가 들어온다.
 *   버튼이 잠겨 있는 동안에는 그 성질이 유지된다.
 *
 * ### 열 때 할 일
 * ```
 * 1. "use client" 를 맨 위에 붙인다
 * 2. buildDiaryCsv(entries, { cropKo, stageNames }) 로 글자를 만든다
 * 3. new Blob([csv], { type: "text/csv;charset=utf-8" }) → URL.createObjectURL
 *    → <a download={diaryCsvFileName(...)}> 를 눌러 준다
 * 4. disabled 와 이 안내 문단을 지운다
 * ```
 * ---------------------------------------------
 */

export function DiaryExportButton() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <button
        className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 font-medium text-fg-subtle text-sm"
        disabled
        type="button"
      >
        파일로 내려받기
      </button>
      <span className="text-fg-subtle text-xs">준비 중입니다</span>
    </div>
  );
}
