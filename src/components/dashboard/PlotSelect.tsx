"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";

/**
 * ---------------------------------------------
 * [Feature]: 홈 날씨 칸의 밭 고르기 — 셀렉트 박스
 *
 * [Description]
 * - 밭이 여럿이면 칩을 가로로 늘어놓는 것보다 셀렉트가 낫다. 칩은 밭이 늘수록
 *   가로로 넘쳐 스크롤이 생기고, 이름이 긴 밭은 잘린다. 셀렉트는 개수와 무관하게
 *   자리가 일정하고, 모바일에서는 기기의 기본 목록 UI 가 떠서 고르기도 쉽다.
 * - **고른 밭은 `?plot=` 로 URL 에 남는다.** 로컬 상태로 두지 않는 이유가 있다 —
 *   같은 선택을 화면 맨 위의 **기상특보 배너**도 읽는다(`HazardBannerSlot`).
 *   여기서만 바꾸면 "배너는 A밭, 예보는 B밭"이 되는데, 재해 경보 화면에서 그건
 *   그냥 틀린 화면이다. `plotSelection.ts` 가 같은 이유로 규칙을 한 곳에 뒀다.
 * - `replace` 를 쓴다(`push` 아님). 밭을 세 번 바꾸고 뒤로 가기를 누르면 홈을
 *   세 번 되짚는 게 아니라 이전 화면으로 나가는 쪽이 맞다.
 * - `scroll: false` — 날씨 칸만 바뀌는데 화면이 맨 위로 튀면 보던 자리를 잃는다.
 * - **밭을 바꾸면 그 밭 예보를 그때 받는다.** 한때 진입 시 모든 밭을 미리
 *   데웠는데, 밭 N개면 동시 요청 N개가 되어 ai-service 의 커넥션 풀(5개)을 채우고
 *   정작 보고 있는 밭의 요청이 타임아웃에 걸렸다. 지금은 항상 한 밭만 부른다.
 *   같은 밭으로 돌아오면 1시간 캐시라 즉시 나온다.
 * - 그래서 전환에 기다림이 생긴다. 여기 `pending` 은 셀렉트를 잠그고 흐리게
 *   만들고, 예보 칸 자체는 `page.tsx` 가 `<Suspense key>` 로 로딩 애니메이션을
 *   띄운다 — 둘이 같이 있어야 "눌렸고, 읽는 중"이 모두 전달된다.
 * ---------------------------------------------
 */

interface PlotSelectProps {
  plots: readonly { id: string; nameKo: string | null }[];
  selectedId: string;
}

export function PlotSelect({ plots, selectedId }: PlotSelectProps) {
  const router = useRouter();
  // 전환 중임을 알린다. 표시가 없으면 누르고도 바뀐 게 없어 보여 다시 누르게 된다.
  const [pending, startTransition] = useTransition();
  /**
   * 고른 값을 화면에 붙잡아 둔다.
   *
   * ⚠️ `value={selectedId}` 만 쓰면 **고른 밭이 눈앞에서 되돌아간다.** `selectedId` 는
   *    서버가 내려주는 값이라 RSC 응답이 도착하기 전에는 바뀌지 않는데, React 는
   *    controlled select 에서 change 이벤트가 끝날 때 DOM 값을 `props.value` 로
   *    되돌린다(react-dom 의 `restoreStateOfTarget`). 즉 사용자가 B밭을 고르면
   *    그 즉시 A밭로 튕기고 서버가 답할 때까지 그대로 있다. 실제로 재현했다.
   *    `useOptimistic` 은 전환이 끝날 때 서버 값으로 자동 정리되므로, 손으로
   *    동기화하는 상태를 따로 들 필요가 없다.
   */
  const [shownId, setShownId] = useOptimistic(selectedId);

  // 밭이 하나뿐이면 고를 것이 없다. 이름만 보여 주고 조작은 주지 않는다.
  if (plots.length < 2) return null;

  return (
    <label className="inline-flex min-w-0 items-center gap-2">
      <span className="sr-only">예보를 볼 밭</span>
      <select
        className={`min-h-9 min-w-0 max-w-52 truncate rounded-lg border border-border bg-surface px-3 font-medium text-fg text-sm transition-colors duration-200 ease-out-expo hover:border-border-strong ${
          pending ? "opacity-60" : ""
        }`}
        // 전환 중에는 잠근다. 안 잠그면 되돌아간 것처럼 보일 때 사용자가 다시
        // 고르고, 이동이 두 번 나간다.
        aria-busy={pending}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value;
          startTransition(() => {
            setShownId(next);
            router.replace(`/dashboard?plot=${next}`, { scroll: false });
          });
        }}
        value={shownId}
      >
        {plots.map((plot) => (
          <option key={plot.id} value={plot.id}>
            {plot.nameKo ?? "이름 없는 밭"}
          </option>
        ))}
      </select>
    </label>
  );
}
