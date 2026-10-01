/**
 * ---------------------------------------------
 * [Feature]: 최근 24시간 시간대별 막대
 *
 * [Description]
 * - 요청 수·외부 호출 수처럼 "언제 몰렸나"만 보면 되는 추이에 쓴다. 축·눈금이 필요한
 *   차트가 아니라서 라이브러리 없이 div 막대로 그린다.
 * - 마지막 막대가 지금 시각이 속한 한 시간이다. 개수는 `title` 로 hover 에 보인다.
 * ---------------------------------------------
 */

export function HourlyBars({
  counts,
  label,
}: {
  counts: number[];
  label: string;
}) {
  const max = Math.max(1, ...counts);
  return (
    <div
      aria-label={`${label} 최근 ${counts.length}시간, 합계 ${counts.reduce((a, b) => a + b, 0)}건`}
      className="flex h-10 items-end gap-px"
      role="img"
    >
      {counts.map((count, i) => (
        <span
          className="flex-1 rounded-t-sm bg-accent/70"
          // biome-ignore lint/suspicious/noArrayIndexKey: 시간 칸의 위치 자체가 키다
          key={i}
          style={{ height: `${Math.max(count ? 8 : 2, (count / max) * 100)}%` }}
          title={`${counts.length - 1 - i}시간 전: ${count}건`}
        />
      ))}
    </div>
  );
}
