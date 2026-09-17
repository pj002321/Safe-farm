import Link from "next/link";
import { plotFaceClass } from "@/components/plot/plotFace";

/**
 * ---------------------------------------------
 * [Feature]: 홈 날씨 칸의 밭 선택
 *
 * [Description]
 * - 밭마다 좌표가 다르므로 예보도 다르다. 한 밭만 보여주면 나머지 밭은 홈에서
 *   영영 안 보이고, 전부 보여주면 홈이 날씨 화면이 되어 버린다(그건 `/weather`
 *   가 할 일이다). 그래서 **고르게** 한다.
 * - **링크다.** 클라이언트 상태가 아니라 `?plot=` 쿼리로 서버가 다시 렌더한다 —
 *   고른 밭이 주소에 남아 새로고침·뒤로가기·공유가 전부 자연스럽게 된다.
 *   JS 없이 동작하고, 예보 호출도 고른 밭 하나뿐이다.
 * - 밭이 하나뿐이면 고를 것이 없으므로 아예 그리지 않는다.
 * - 얼굴색은 `plotFaceClass` — 홈의 텃밭 띠·텃밭 관리·날씨 목록과 같은 밭이면
 *   같은 색이다.
 * ---------------------------------------------
 */

interface PlotPickerProps {
  plots: readonly { id: string; nameKo: string | null }[];
  selectedId: string;
}

export function PlotPicker({ plots, selectedId }: PlotPickerProps) {
  if (plots.length < 2) return null;

  return (
    // 밭이 많으면 가로로 흐른다. 세로로 쌓으면 홈에서 날씨 칸이 목록이 된다.
    // ⚠️ 가로 스크롤은 이 띠 안에서만 일어난다(페이지 전체가 아니다).
    <ul className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {plots.map((plot) => {
        const active = plot.id === selectedId;
        return (
          <li key={plot.id}>
            <Link
              aria-current={active ? "true" : undefined}
              // min-h-9 = 36px. 텍스트 칩이라 44px 규칙(텍스트 버튼)보다는
              // 작지만, 가로로 나란한 칩이므로 좌우 여백이 오조작을 막는다.
              className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 font-medium text-sm transition-colors duration-200 ease-out-expo ${
                active
                  ? "border-accent bg-accent-subtle text-accent"
                  : "border-border text-fg-muted hover:border-border-strong hover:text-fg"
              }`}
              href={`/dashboard?plot=${plot.id}`}
              // 날씨 칸만 바뀌므로 그 자리로 돌아온다.
              scroll={false}
            >
              <span
                aria-hidden="true"
                className={`grid size-5 shrink-0 place-items-center rounded-full text-[0.6rem] ${plotFaceClass(plot.id)}`}
              >
                {(plot.nameKo ?? "밭").slice(0, 1)}
              </span>
              <span className="max-w-32 truncate">
                {plot.nameKo ?? "이름 없는 밭"}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
