import { Card } from "@/components/shared/Card";
import type {
  Grade,
  SuitabilityResult,
} from "@/features/recommendation/domain/suitability";
import { formatScore } from "@/shared/utils/format";

/**
 * ---------------------------------------------
 * [Feature]: 작물 적합도 카드 (피쳐 컴포넌트)
 *
 * [Description]
 * - 공용 프리미티브(Card)를 조립하고, 도메인 의미(등급별 색)를 여기서 입힌다.
 *   공용 컴포넌트는 도메인을 몰라야 재사용된다 — 그래서 Card 에는 grade 개념이 없다.
 * - 도메인 타입(`SuitabilityResult`)을 그대로 받는다. 화면용 타입을 따로 만들지 않는다.
 * - 위험 요인이 없을 때(빈 상태)도 화면이 비지 않게 처리한다.
 *
 * [Usage]
 * ```tsx
 * <SuitabilityCard cropName="토마토" result={scoreSuitability(tomato, weather)} />
 * ```
 * ---------------------------------------------
 */

const GRADE_LABEL: Record<Grade, string> = {
  good: "적합",
  caution: "주의",
  unsuitable: "부적합",
};

const GRADE_COLOR: Record<Grade, string> = {
  good: "text-good",
  caution: "text-caution",
  unsuitable: "text-unsuitable",
};

const RISK_LABEL: Record<string, string> = {
  cold: "저온",
  heat: "고온",
  drought: "가뭄",
  flood: "과습",
  lowLight: "일조 부족",
};

interface SuitabilityCardProps {
  cropName: string;
  result: SuitabilityResult;
}

export function SuitabilityCard({ cropName, result }: SuitabilityCardProps) {
  return (
    <Card
      tone={result.grade === "good" ? "accent" : "default"}
      title={
        <span className="flex items-baseline gap-2">
          {cropName}
          <span className={`text-sm ${GRADE_COLOR[result.grade]}`}>
            {GRADE_LABEL[result.grade]} · {formatScore(result.score)}
          </span>
        </span>
      }
    >
      {result.risks.length === 0 ? (
        <p className="text-fg-muted">위험 요인 없음</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {result.risks.map((risk) => (
            <li
              key={risk.kind}
              className="rounded-full border border-border px-2 py-0.5 text-xs"
            >
              {RISK_LABEL[risk.kind] ?? risk.kind}
              <span className="ml-1 text-fg-muted">
                {Math.round(risk.severity * 100)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
