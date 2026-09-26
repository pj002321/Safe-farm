import { Card } from "@/components/shared/Card";

/**
 * ---------------------------------------------
 * [Feature]: 아직 없는 관리자 화면의 자리표시
 *
 * [Description]
 * - 빈 화면을 빈 채로 두지 않는다 — "아직 안 만든 것"과 "불러오기 실패"를 화면에서
 *   구분할 수 있어야 한다(`members/page.tsx` 의 빈 상태 처리와 같은 이유).
 * - 항목은 기능정의서 코드·이름 그대로다. 이 화면이 무엇을 받을 자리인지 화면
 *   자체가 말하게 한다. **항목이 구현되면 목록에서 지우고, 다 지워지면 카드를 뺀다.**
 * - 서버 컴포넌트다. 상태도 상호작용도 없다.
 *
 * [Usage]
 * ```tsx
 * <AdminPlanned items={[{ code: "V1-103", nameKo: "실행 이력 조회" }]} />
 * ```
 * ---------------------------------------------
 */

export interface PlannedItem {
  /** 기능정의서 코드. "V1-103" 처럼 그대로 적는다. */
  code: string;
  nameKo: string;
}

export function AdminPlanned({ items }: { items: readonly PlannedItem[] }) {
  return (
    <Card title="이 화면에 들어올 것" tone="default">
      <ul className="flex flex-col gap-1.5 text-sm">
        {items.map((item) => (
          <li className="flex items-baseline gap-3" key={item.code}>
            <span className="font-mono text-fg-subtle text-xs">
              {item.code}
            </span>
            <span>{item.nameKo}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-fg-muted text-xs">
        아직 만들지 않았습니다. 목록은 기능정의서의 항목 그대로입니다.
      </p>
    </Card>
  );
}
