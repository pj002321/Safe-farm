import Link from "next/link";
import { HarvestIcon } from "@/components/icons";
import { Badge } from "@/components/shared/Badge";
import { Button } from "@/components/shared/Button";
import { EmptyState } from "@/components/shared/EmptyState";
import { DIARY_EXPORT_MAX } from "@/features/cultivations/domain/diaryCsv";
import {
  type CultivationRecord,
  filterByYear,
  groupByYear,
} from "@/features/plots/domain/cultivationRecord";

/**
 * ---------------------------------------------
 * [Feature]: 마이페이지 — 지난 재배 기록(연도별) · 영농일지 내보내기
 *
 * [Description]
 * - **연도 고르기를 `searchParams` 로 한다**(`/me?year=2025`). 라디오 + `group-has`
 *   로 하면 연도가 데이터에서 오므로 클래스가 동적이 되고, Tailwind 는 클래스
 *   문자열을 정적으로 읽어서 **조용히 생성되지 않는다**(마법사가 네 벌을 리터럴로
 *   적은 것과 같은 벽). 링크는 그 벽이 없다.
 * - **줄마다 체크해 고른 것만 내보낸다.** 목록 전체가 `<form method="get">` 이라
 *   체크 상태는 **브라우저가 든다** — 이 패널에 스크립트가 0줄인 까닭이다.
 *   ⚠️ "이 패널" 이다. `/me` 화면 전체는 아니다 — `AccountPanel` 아래 `WithdrawButton`
 *      은 클라이언트 컴포넌트다. 여기서 말하는 건 재배기록 구역뿐이다.
 *   누르면 `/api/me/diary-csv?id=a&id=b` 로 가고 **파일은 서버가 만든다.**
 *   ⚠️ 줄마다 버튼을 다는 길도 있었으나 택하지 않았다. 그러면 "한꺼번에" 를 못 하고
 *     줄이 서른이면 버튼이 서른이다. 체크는 **줄마다 버튼을 포함한다** — 하나만
 *     체크하면 그게 곧 그 작물만 내보내기다.
 *   ⚠️ 그래서 **화면에 보이는 것 ⊇ 파일에 나가는 것**이다. 체크로 뺀 줄은 빠진다.
 *     반대(화면에 없는 것이 파일에 들어가는 것)는 구조적으로 못 일어난다 — 체크박스가
 *     그려진 줄만 폼에 들어가기 때문이다.
 * - **CSV 를 독립 구역으로 만들지 않았다.** 버튼 하나 + 설명 한 줄이라 구역으로
 *   올리면 눌러 들어가서 버튼 하나를 보는 화면이 된다.
 * - **작물명이 아카이브로 가는 문이다.** 끝난 재배는 상세 화면이 저절로 읽기 전용이
 *   되므로(`!ended` 가 조작 다섯을 걷고 수확 요약이 그 자리에 뜬다) 따로 만들 화면이
 *   없다. 그래서 여기서는 그리로 보내기만 한다.
 *   ⚠️ 링크가 404 날 일은 없다 — 밭을 지우면 `softDeletePlot` 이 그 밭의 재배도
 *     같이 지워 목록에서 빠진다(2026-09-22 실측: 어긋난 행 0건).
 * - 값은 `plotStore.ts` 의 `listCultivationRecords()` 가 조회해 온다. 이
 *   컴포넌트는 `CultivationRecord[]` 만 본다. **CSV 의 칸·줄은 여기가 모른다** —
 *   그건 `domain/diaryCsv.ts` 와 그 라우트의 일이다.
 *
 * [Usage]
 * ```tsx
 * <RecordPanel records={records} year={2025} />
 * ```
 * ---------------------------------------------
 */

/**
 * 라우트가 되돌려 보낸 까닭. **키만 주소로 오고 문장은 여기 있다.**
 *
 * `app/api/me/diary-csv` 의 `backToRecords()` 와 짝이다 — 키를 늘리면 양쪽을 같이
 * 본다. 모르는 키는 아무것도 그리지 않는다(주소를 손으로 고쳐 넣은 경우).
 */
const ERROR_KO: Record<string, string> = {
  "records-none":
    "한 줄 이상 골라 주세요. 고른 것이 없어 파일을 만들지 못했습니다.",
  "records-many": `한 번에 ${DIARY_EXPORT_MAX}건까지 받을 수 있습니다. 연도로 나눠서 받아 주세요.`,
  "records-gone":
    "고른 기록을 찾지 못했습니다. 그새 지워졌을 수 있으니 목록을 다시 확인해 주세요.",
};

interface RecordPanelProps {
  records: readonly CultivationRecord[];
  /** 고른 연도. `null` 이면 전체. */
  year: number | null;
  /** `/me?error=…` 의 키. 내보내기 라우트가 되돌려 보냈을 때만 들어온다. */
  error?: string;
}

export function RecordPanel({ records, year, error }: RecordPanelProps) {
  const years = groupByYear(records).map((group) => group.year);
  const filtered = filterByYear(records, year);
  const groups = groupByYear(filtered);
  const 너무많다 = filtered.length > DIARY_EXPORT_MAX;

  return (
    // 목록과 버튼이 한 폼 안이라 체크가 그대로 서버로 간다. 파일을 만드는 것은
    // `app/api/me/diary-csv` — 상세 화면의 내보내기도 **같은 라우트**를 쓴다.
    // `group/export` 는 아래 안내문이 체크 상태를 내려다보기 위한 것이다.
    <form action="/api/me/diary-csv" className="group/export" method="get">
      {year !== null && <input name="year" type="hidden" value={year} />}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-fg-muted text-sm">
          거두거나 중단한 재배를 모았습니다. 작물명을 누르면 그때 기록이 그대로
          있습니다.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {/* 하나도 안 골랐을 때만 나온다. `:has()` 라 **스크립트가 0줄**이다.
              ⚠ 버튼을 끄지 않는다. CSS 로는 진짜 `disabled` 가 안 되고(그건 JS 다),
                흐리게만 해 두면 **왜 안 눌리는지 모르는 상태**가 생긴다. 눌러도
                되게 두고 이유를 미리 말한다 — 눌렀을 때는 라우트가 이 화면으로
                되돌리며 같은 문장을 띄운다(2026-09-22 결정). */}
          {groups.length > 0 && (
            <p className="text-fg-subtle text-xs group-has-[input:checked]/export:hidden">
              한 줄 이상 골라 주세요.
            </p>
          )}
          {/* 폼 안이라 그냥 submit 이다. 체크 상태는 브라우저가 들고 있고
              `?id=a&id=b` 로 넘어간다 — 이 패널에 스크립트가 0줄인 까닭.
              ⚠ 클래스를 손으로 적지 않는다. `Button` 은 서버 컴포넌트라 폼 안에서
                그대로 쓸 수 있고, outline 의 색·간격은 그쪽이 단일 출처다. */}
          <Button type="submit" variant="outline">
            고른 것 내보내기
          </Button>
        </div>
      </div>

      {/* 되돌아왔을 때. 문장은 **여기가 갖는다** — 주소로 받아 그리면 남이 만든
          링크로 아무 글이나 이 화면에 띄울 수 있다. */}
      {error !== undefined && ERROR_KO[error] !== undefined && (
        <p className="mb-4 rounded-lg border border-caution bg-caution/5 px-4 py-3 text-caution text-sm">
          {ERROR_KO[error]}
        </p>
      )}

      {/* 100건이 넘는 해는 **누르기 전에** 알려 준다. 목록 건수는 서버가 이미
          알지만 체크한 개수는 CSS 로 셀 수 없어, 고른 수가 아니라 **이 목록이
          넘는지**로 잰다. 실제로 넘겨 누르면 라우트가 거절하고 위 문장이 뜬다. */}
      {너무많다 && (
        <p className="mb-4 text-fg-muted text-xs">
          한 번에 {DIARY_EXPORT_MAX}건까지 받을 수 있습니다. 지금{" "}
          {filtered.length}
          건이니 연도로 나눠서 받아 주세요.
        </p>
      )}

      {/* 연도 칩. 헤더 탭과 같은 세그먼트 언어를 쓴다 — 새 패턴을 만들지 않는다. */}
      {years.length > 0 && (
        <ul className="flex flex-wrap items-center gap-0.5 rounded-full border border-border bg-surface-2/70 p-1">
          {/* `section=records` 를 붙인다 — lg 이상에서는 고른 구역 하나만 보이는데
              주소로 다시 열리면 계정 구역이 떠서, 연도를 눌렀는데 목록이 사라졌다. */}
          <YearChip
            active={year === null}
            href="/me?section=records"
            labelKo="전체"
          />
          {years.map((y) => (
            <YearChip
              active={year === y}
              href={`/me?section=records&year=${y}`}
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
                    <div className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_11rem_minmax(0,1fr)_auto] sm:items-baseline">
                      {/* 고르는 과녁. 옆의 작물명(들어가는 과녁)과 겹치지 않게
                          체크박스 자체에만 건다 — 줄을 통째로 누르게 하면
                          상세로 들어가려다 체크가 풀린다. */}
                      <input
                        aria-label={`${record.cropKo} 내보내기에 넣기`}
                        className="size-4 accent-accent sm:translate-y-0.5"
                        defaultChecked
                        name="id"
                        type="checkbox"
                        value={record.id}
                      />
                      <span className="font-mono text-fg-subtle text-xs tabular-nums">
                        {record.sowingDate} → {record.endDate}
                      </span>
                      <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                        {/* 작물명**만** 링크다. 줄 전체를 링크로 만들면 체크박스를
                            누르려다 화면이 넘어간다(교안 §3). 끝난 재배는 상세가
                            읽기 전용 아카이브가 되어 있어 그대로 보내면 된다. */}
                        <Link
                          className="font-medium text-accent text-sm underline decoration-1 underline-offset-2 hover:text-accent-hover"
                          href={`/plots/${record.plotId}/cultivations/${record.id}`}
                        >
                          {record.cropKo}
                        </Link>
                        <span className="text-fg-muted text-xs">
                          {record.plotKo}
                        </span>
                        {/* 수확은 배지를 안 단다 — 여기 있는 것이 이미 끝났다는 뜻이라
                            줄마다 `수확 완료` 가 붙으면 아무것도 구별해 주지 않는다.
                            밭 화면과 같은 말을 쓴다(`CultivationList` 의 STATUS_LABEL). */}
                        {record.endKind === "FAILED" && (
                          <Badge size="sm" tone="unsuitable">
                            실패
                          </Badge>
                        )}
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
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </form>
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
