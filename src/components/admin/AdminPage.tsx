import type { ReactNode } from "react";

/**
 * ---------------------------------------------
 * [Feature]: 관리자 화면의 공통 틀 (제목 · 한 줄 설명 · 본문)
 *
 * [Description]
 * - 여섯 화면이 같은 폭·여백·제목 크기를 쓴다. 각자 <main> 을 들고 있으면 폭 하나
 *   바꾸는 데 여섯 파일을 고쳐야 한다. 페이지는 무엇을 보여줄지만 정하고 틀은 여기서.
 * - 회원 상세(`members/[id]`)는 제목 위에 뒤로 링크가 있어 이 틀에 안 맞는다.
 *   그 한 장은 자기 <main> 을 그대로 둔다 — 틀에 슬롯을 늘리는 것보다 그게 싸다.
 * - 서버 컴포넌트다. 상태도 상호작용도 없다.
 *
 * [Usage]
 * ```tsx
 * <AdminPage titleKo="배치 관리" descriptionKo="무엇이 돌았고 무엇이 비었는지를 보는 자리입니다.">
 *   <AdminPlanned items={PLANNED} />
 * </AdminPage>
 * ```
 * ---------------------------------------------
 */
export function AdminPage({
  titleKo,
  descriptionKo,
  children,
}: {
  titleKo: string;
  descriptionKo?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-8">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">{titleKo}</h1>
        {descriptionKo && (
          <p className="mt-2 text-fg-muted text-sm">{descriptionKo}</p>
        )}
      </div>
      {children}
    </main>
  );
}
