import Link from "next/link";
import { HarvestIcon } from "@/components/icons";
import { CsvDownloadButton } from "@/components/shared/CsvDownloadButton";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  type CultivationRecord,
  cultivationDays,
  filterByYear,
  groupByYear,
  yearOf,
} from "@/features/plots/domain/cultivationRecord";

/**
 * ---------------------------------------------
 * [Feature]: 마이페이지 — 지난 재배 기록(연도별) · CSV 내보내기
 *
 * [Description]
 * - **연도 고르기를 `searchParams` 로 한다**(`/me?year=2025`). 라디오 + `group-has`
 *   로 하면 연도가 데이터에서 오므로 클래스가 동적이 되고, Tailwind 는 클래스
 *   문자열을 정적으로 읽어서 **조용히 생성되지 않는다**(마법사가 네 벌을 리터럴로
 *   적은 것과 같은 벽). 링크는 그 벽이 없고, 무엇보다 **화면에 보이는 것 = CSV 로
 *   나가는 것**이 공짜로 맞아떨어진다.
 * - **CSV 를 독립 구역으로 만들지 않았다.** 버튼 하나 + 설명 한 줄이라 구역으로
 *   올리면 눌러 들어가서 버튼 하나를 보는 화면이 된다. "지금 보고 있는 것을
 *   내보낸다"가 유일하게 말이 되는 자리라 제목 줄 오른쪽에 둔다.
 * - 재배 기간(`cultivationDays`)은 **CSV 에만** 넣는다. 화면 줄에 '62일'까지 넣으면
 *   칸이 넷이 되어 읽는 속도가 떨어진다. 파일에서는 정렬·계산에 쓸모가 있다.
 * - 값은 `plotStore.ts` 의 `listCultivationRecords()` 가 조회해 온다. 이
 *   컴포넌트는 `CultivationRecord[]` 만 본다.
 *
 * [Usage]
 * ```tsx
 * <RecordPanel records={records} year={2025} />
 * ```
 * ---------------------------------------------
 */

interface RecordPanelProps {
  records: readonly CultivationRecord[];
  /** 고른 연도. `null` 이면 전체. */
  year: number | null;
}

const CSV_HEADERS = [
  "수확연도",
  "텃밭",
  "작물",
  "파종일",
  "수확일",
  "재배일수",
  "수확량(kg)",
  "메모",
] as const;

export function RecordPanel({ records, year }: RecordPanelProps) {
  const years = groupByYear(records).map((group) => group.year);
  const filtered = filterByYear(records, year);
  const groups = groupByYear(filtered);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-fg-muted text-sm">
          끝난 재배만 모았습니다. 다음 시즌을 정할 때 보시라고 남깁니다.
        </p>
        <CsvDownloadButton
          filename={`재배기록_${year ?? "전체"}.csv`}
          headers={[...CSV_HEADERS]}
          rows={filtered.map((record) => [
            yearOf(record),
            record.plotKo,
            record.cropKo,
            record.sowingDate,
            record.harvestDate,
            cultivationDays(record),
            record.yieldKg,
            record.noteKo,
          ])}
        >
          CSV 내려받기
        </CsvDownloadButton>
      </div>

      {/* 연도 칩. 헤더 탭과 같은 세그먼트 언어를 쓴다 — 새 패턴을 만들지 않는다. */}
      {years.length > 0 && (
        <ul className="flex flex-wrap items-center gap-0.5 rounded-full border border-border bg-surface-2/70 p-1">
          <YearChip active={year === null} href="/me" labelKo="전체" />
          {years.map((y) => (
            <YearChip
              active={year === y}
              href={`/me?year=${y}`}
              key={y}
              labelKo={String(y)}
            />
          ))}
        </ul>
      )}

      {groups.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            actionHref="/plots/new"
            actionKo="텃밭 등록하기"
            bodyKo="재배가 끝나면 그해 기록이 이 자리에 쌓입니다."
            icon={<HarvestIcon />}
            titleKo="아직 끝난 재배가 없습니다"
          />
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-7">
          {groups.map((group) => (
            <section key={group.year}>
              <h3 className="flex items-baseline gap-3 font-mono text-fg-subtle text-xs uppercase tracking-[0.2em]">
                <span className="text-base text-fg tabular-nums tracking-normal">
                  {group.year}
                </span>
                <span aria-hidden="true" className="h-px flex-1 bg-border" />
                {/* 합계가 null 이면 '—'. 0kg 흉작과 미기록은 다른 값이다. */}
                <span className="tabular-nums">
                  {group.totalYieldKg === null
                    ? "기록 없음"
                    : `${group.totalYieldKg.toLocaleString("ko-KR")} kg`}
                </span>
              </h3>

              <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
                {group.records.map((record) => (
                  <li className="px-5 py-3.5" key={record.id}>
                    <div className="grid gap-x-4 gap-y-1 sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:items-baseline">
                      <span className="font-mono text-fg-subtle text-xs tabular-nums">
                        {record.sowingDate} → {record.harvestDate}
                      </span>
                      <span className="min-w-0">
                        <span className="font-medium text-fg text-sm">
                          {record.cropKo}
                        </span>
                        <span className="ml-2 text-fg-muted text-xs">
                          {record.plotKo}
                        </span>
                      </span>
                      <span className="font-mono text-fg text-sm tabular-nums">
                        {record.yieldKg === null
                          ? "—"
                          : record.yieldKg.toLocaleString("ko-KR")}
                        <span className="ml-0.5 text-fg-subtle text-xs">
                          kg
                        </span>
                      </span>
                    </div>
                    {record.noteKo && (
                      <p className="mt-1.5 text-fg-muted text-xs leading-relaxed">
                        {record.noteKo}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function YearChip({
  href,
  labelKo,
  active,
}: {
  href: string;
  labelKo: string;
  active: boolean;
}) {
  return (
    <li>
      <Link
        aria-current={active ? "page" : undefined}
        className={`inline-flex items-center rounded-full px-3.5 py-1.5 font-medium text-[0.82rem] tabular-nums transition-[background-color,color,box-shadow] duration-200 ease-out-expo ${
          active
            ? "bg-surface text-accent shadow-e1"
            : "text-fg-muted hover:text-fg"
        }`}
        href={href}
      >
        {labelKo}
      </Link>
    </li>
  );
}
