import { CalendarIcon, SproutIcon } from "@/components/icons";
import { SowingStatusOption } from "@/components/plot/CropCards";
import { Badge } from "@/components/shared/Badge";
import { ButtonLink } from "@/components/shared/Button";
import { GrowthGauge } from "@/components/shared/GrowthGauge";
import { SubmitButton } from "@/components/shared/SubmitButton";
import {
  type CultivationCard,
  type CultivationStatus,
  cardTitle,
} from "@/features/cultivations/domain/cultivationCard";
import type { GrowthGauge as Gauge } from "@/features/cultivations/domain/growthGauge";
import type { PlotGrowth } from "@/features/cultivations/growthStore";
import { yearsSincePlanting } from "@/shared/growth/fruitOrigin";

/**
 * ---------------------------------------------
 * [Feature]: 밭 상세 — 심은 작물 카드 목록
 *
 * [Description]
 * - 카드 한 장이 재배 한 건이다. 밭 하나에 배추를 8월에, 무를 9월에 심을 수
 *   있어 밭 정보만으로는 "지금 무엇이 어디까지 자랐나"를 못 보여준다.
 * - 게이지의 숫자는 전부 `growthGauge.ts` 가 낸 것이다. 여기서는 계산하지 않고
 *   **찍기만 한다** — 화면에서 한 번 더 계산하면 같은 밭의 값이 화면마다 갈린다.
 * - **관측이 모자란 상태를 숨기지 않는다.** 빠진 날은 0 으로 더해져 누적이 실제보다
 *   낮게 나오는데, 그냥 보여주면 사용자는 작물이 안 자란 줄 안다.
 * - 삭제는 `PlotManageList` 와 같은 급의 확인을 요구한다(제14조). 다만 겨냥
 *   라디오 대신 `<details>` 를 쓴다 — 카드마다 폼이 따로라 폼 바깥에 라디오를
 *   둘 이유가 없다.
 * - **파종일도 여기서 고친다.** 등록·작물 추가 때는 한 번만 받고 고칠 길이
 *   없었다 — GDD 적산 기준점이라 잘못 적으면 게이지가 계속 틀어진다. 재배
 *   건마다 따로라 밭 화면이 아니라 카드 안에 둔다. 입력은 등록 마법사의
 *   `SowingStatusOption`(`CropCards.tsx`)을 그대로 쓴다.
 *
 * [Usage]
 * ```tsx
 * <CultivationList cards={cards} growth={growth} onHarvest={…} onDelete={…}
 *   onEditSowing={…} />
 * ```
 * ---------------------------------------------
 */

interface CultivationListProps {
  plotId: string;
  cards: readonly CultivationCard[];
  growth: PlotGrowth;
  /** 한국 기준 오늘. D+n 을 서버에서 정해 내려보낸다. */
  today: string;
  onHarvest: (formData: FormData) => Promise<void>;
  onDelete: (formData: FormData) => Promise<void>;
  onEditSowing: (formData: FormData) => Promise<void>;
}

const STATUS_LABEL: Record<CultivationStatus, string> = {
  PLANNED: "심을 예정",
  GROWING: "자라는 중",
  HARVESTED: "수확 완료",
  FAILED: "실패",
};

const STATUS_TONE: Record<
  CultivationStatus,
  "neutral" | "good" | "info" | "unsuitable"
> = {
  PLANNED: "info",
  GROWING: "good",
  HARVESTED: "neutral",
  FAILED: "unsuitable",
};

const MATURITY_LABEL: Record<string, string> = {
  EARLY: "조생종",
  MID: "중생종",
  LATE: "만생종",
};

const DAY_MS = 86_400_000;

/** 심은 날부터 며칠째인지. 달력 날짜끼리라 UTC 자정으로 고정해 뺀다. */
function daysSince(sowingDate: string, today: string): number | null {
  const from = Date.parse(`${sowingDate}T00:00:00Z`);
  const to = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.round((to - from) / DAY_MS);
}

export function CultivationList({
  plotId,
  cards,
  growth,
  today,
  onHarvest,
  onDelete,
  onEditSowing,
}: CultivationListProps) {
  if (cards.length === 0) {
    // 버튼을 달지 않는다. 작물이 0건이면 바로 아래에 작물 선택 폼이 펼쳐진 채로
    // 나오므로(`plots/[id]/page.tsx`), 여기에 버튼을 두면 같은 일을 시키는 것이
    // 둘이 된다. `EmptyState` 는 액션이 필수라 쓰지 않고 안내만 낸다 — "막다른
    // 빈 화면을 만들지 않는다"는 그 규약의 취지는 아래 폼이 채운다.
    // 예전에는 여기 버튼이 `/plots/new` 로 갔다. 밭은 이미 있는데 밭이 하나 더
    // 생겼다 — 밭 상세에 작물을 더하는 폼이 나중에 붙으면서 어긋난 링크다.
    return (
      <div className="rounded-lg border border-border border-dashed bg-surface-2/40 px-6 py-8 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent-subtle text-2xl text-accent">
          <SproutIcon />
        </span>
        <p className="mt-4 font-semibold text-fg text-lg">
          아직 심은 작물이 없습니다
        </p>
        <p className="mx-auto mt-2 max-w-md text-balance text-fg-muted text-sm leading-relaxed">
          아래에서 심은 작물을 골라 주시면 그 자리의 기상 관측으로 생육 단계를
          계산해 드립니다.
        </p>
      </div>
    );
  }

  const gaugeById = new Map(
    growth.growths.map((item) => [item.cultivationId, item.gauge]),
  );

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {cards.map((card) => (
          <CultivationItem
            card={card}
            gauge={gaugeById.get(card.id) ?? null}
            key={card.id}
            onDelete={onDelete}
            onEditSowing={onEditSowing}
            onHarvest={onHarvest}
            plotId={plotId}
            today={today}
          />
        ))}
      </ul>

      {growth.stationCode !== null && (
        // 어느 관측소를 읽었는지 밝힌다. 밭에서 먼 관측소가 잡히면 사용자가
        // 그 사실을 알아야 게이지를 얼마나 믿을지 판단할 수 있다.
        <p className="font-mono text-fg-subtle text-xs">
          기온 출처: {growth.stationNameKo ?? growth.stationCode} 관측소
          {growth.latestObsDate !== null &&
            ` · 관측 ${growth.latestObsDate}까지`}
        </p>
      )}
    </div>
  );
}

function CultivationItem({
  plotId,
  card,
  gauge,
  today,
  onHarvest,
  onDelete,
  onEditSowing,
}: {
  plotId: string;
  card: CultivationCard;
  gauge: Gauge | null;
  today: string;
  onHarvest: (formData: FormData) => Promise<void>;
  onDelete: (formData: FormData) => Promise<void>;
  onEditSowing: (formData: FormData) => Promise<void>;
}) {
  const title = cardTitle(card);
  const days = card.sowingDate ? daysSince(card.sowingDate, today) : null;
  const maturity = card.maturityType
    ? (MATURITY_LABEL[card.maturityType] ?? card.maturityType)
    : null;
  // ★ 과수는 **n년차**를 쓴다 — 2026-09-20 (`교안_과수를_살린다.md` §9-6).
  //   나무를 5년 전에 심었으면 `D+1998` 이 되는데, 그 숫자는 올해의 생육을
  //   말하지 못한다. 심은 지 몇 해째인지가 농민이 쓰는 말이다.
  //
  //   ⚠ 심은 날은 그대로 적는다. 뜻이 사라지는 것은 `D+` 쪽뿐이다.
  const years = yearsSincePlanting(card, card.sowingDate, today);

  return (
    <li className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 pt-4">
        <p className="min-w-0 flex-1 truncate font-medium text-fg">{title}</p>
        <Badge size="sm" tone={STATUS_TONE[card.status]}>
          {STATUS_LABEL[card.status]}
        </Badge>
      </div>

      <p className="px-5 pt-1 text-fg-muted text-xs">
        {[
          card.aliasKo && card.cropNameKo,
          maturity,
          card.sowingDate
            ? `${card.sowingType === "SEEDLING" ? "정식" : "파종"} ${card.sowingDate}`
            : "파종일 모름",
          years !== null
            ? `${years}년차`
            : days !== null && days >= 0
              ? `D+${days}`
              : null,
          card.harvestedAt ? `수확 ${card.harvestedAt}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>

      <div className="px-5 py-4">
        {gauge ? (
          <CultivationGauge card={card} gauge={gauge} />
        ) : (
          <p className="text-fg-subtle text-sm">
            {card.status === "PLANNED"
              ? "심으면 그날부터 적산온도를 쌓습니다."
              : "이 품종의 생육 단계표가 아직 없어 진행률을 낼 수 없습니다."}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-border border-t px-5 py-3">
        {/* 상세는 링크다. 카드 전체를 링크로 묶지 않는 이유는 그 안에 수확·삭제
            버튼이 들어 있어서다 — 중첩되면 어느 쪽이 눌렸는지 흐려진다. */}
        <ButtonLink
          href={`/plots/${plotId}/cultivations/${card.id}`}
          size="sm"
          variant="secondary"
        >
          상세 보기
        </ButtonLink>

        {card.status === "GROWING" && (
          <form action={onHarvest}>
            <input name="plotId" type="hidden" value={plotId} />
            <input name="cultivationId" type="hidden" value={card.id} />
            <SubmitButton pendingKo="기록하는 중" size="sm" variant="outline">
              수확 완료
            </SubmitButton>
          </form>
        )}

        {/* 수확·실패 처리된 건은 되돌릴 일이 아니라 수정 칸을 안 보여준다. */}
        {(card.status === "GROWING" || card.status === "PLANNED") && (
          <details className="w-full [&_summary]:list-none">
            <summary className="inline-flex w-fit cursor-pointer items-center gap-1 rounded-md px-3 py-1.5 font-medium text-fg-muted text-sm transition-colors duration-200 ease-out-expo hover:bg-surface-2 hover:text-fg">
              <CalendarIcon className="size-3.5" />
              파종일 수정
            </summary>
            <form
              action={onEditSowing}
              className="group/sowing mt-3 flex flex-col gap-3 rounded-lg bg-surface-2 p-4"
            >
              <input name="plotId" type="hidden" value={plotId} />
              <input name="cultivationId" type="hidden" value={card.id} />
              <fieldset className="flex flex-col gap-1.5">
                <legend className="font-medium text-fg text-xs">파종일</legend>
                <SowingStatusOption
                  defaultChecked={card.sowingDate !== null}
                  labelKo="날짜를 압니다"
                  name="sowingStatus"
                  value="known"
                />
                <SowingStatusOption
                  defaultChecked={card.sowingDate === null}
                  labelKo="아직 안 심었어요"
                  name="sowingStatus"
                  value="unknown"
                />
              </fieldset>

              {/* "날짜를 압니다"를 골랐을 때만 나타난다(CropSowingFields 와 같은 패턴). */}
              <div className="hidden flex-col gap-1.5 group-has-[input[value=known]:checked]/sowing:flex">
                <label
                  className="font-medium text-fg text-xs"
                  htmlFor={`sowing-date-${card.id}`}
                >
                  날짜 선택
                </label>
                <input
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-fg text-sm transition-colors hover:border-accent focus:border-accent"
                  defaultValue={card.sowingDate ?? ""}
                  id={`sowing-date-${card.id}`}
                  // 미래 날짜를 고르면 심지도 않은 작물이 "자라는 중"이 된다.
                  // 달력을 오늘에서 끊고, 같은 판정을 `editCultivationSowing` 이 한 번 더 한다.
                  max={today}
                  name="sowingDate"
                  type="date"
                />
              </div>

              <div>
                <SubmitButton pendingKo="저장하는 중" size="sm">
                  저장
                </SubmitButton>
              </div>
            </form>
          </details>
        )}

        {/* 삭제는 한 번 더 묻는다. 펼치기에 네이티브 details 를 써서 JS 가 0줄이다. */}
        <details className="w-full [&_summary]:list-none">
          <summary className="inline-flex w-fit cursor-pointer items-center rounded-md px-3 py-1.5 font-medium text-fg-muted text-sm transition-colors duration-200 ease-out-expo hover:bg-unsuitable/10 hover:text-unsuitable">
            삭제
          </summary>
          <div className="mt-3 rounded-lg border border-unsuitable/25 bg-unsuitable/5 p-4">
            <p className="text-fg text-sm leading-relaxed">
              <strong className="font-semibold">&ldquo;{title}&rdquo;</strong>의
              재배 기록을 지웁니다. 파종일과 생육 단계를 더 볼 수 없고{" "}
              <strong className="font-semibold text-unsuitable">
                되돌릴 수 없습니다.
              </strong>{" "}
              거두신 것을 정리하시려면 <em className="not-italic">수확 완료</em>
              를 눌러 주세요 — 기록이 남습니다.
            </p>
            <form action={onDelete} className="mt-3">
              <input name="plotId" type="hidden" value={plotId} />
              <input name="cultivationId" type="hidden" value={card.id} />
              <SubmitButton pendingKo="지우는 중" size="sm" variant="danger">
                삭제합니다
              </SubmitButton>
            </form>
          </div>
        </details>
      </div>
    </li>
  );
}

function CultivationGauge({
  card,
  gauge,
}: {
  card: CultivationCard;
  gauge: Gauge;
}) {
  const missing = Math.max(0, gauge.expectedDays - gauge.coveredDays);

  return (
    <div className="flex flex-col gap-3">
      <GrowthGauge
        dayLabelKo={
          gauge.stage ? gauge.stage.stageNameKo : "수확 시기를 지났습니다"
        }
        footEndKo={
          gauge.daysLeft === null
            ? "수확 시기 추정 불가"
            : gauge.daysLeft === 0
              ? "수확 시기"
              : `수확까지 약 ${gauge.daysLeft}일`
        }
        footStartKo={
          card.sowingDate ? `파종 ${card.sowingDate.slice(5)}` : "모종부터"
        }
        markLabelKo={gauge.stage ? `${gauge.stage.stageNameKo} 끝` : ""}
        markRatio={gauge.markRatio}
        revealed
        target={gauge.targetGdd}
        value={gauge.accumulatedGdd}
      />

      {gauge.stage?.guideKo && (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-fg-muted text-sm leading-relaxed">
          {gauge.stage.guideKo}
        </p>
      )}

      {missing > 0 && (
        // 빠진 날은 0 으로 더해진다. 그 사실을 말하지 않으면 사용자는 작물이
        // 안 자란 줄 안다 — 실제로는 우리가 기온을 못 읽은 것이다.
        <p className="text-caution text-xs leading-relaxed">
          파종일부터 오늘까지 {gauge.expectedDays}일 중 {missing}일의 관측이
          없습니다. 그만큼 누적 적산온도가 실제보다 낮게 나옵니다.
        </p>
      )}
    </div>
  );
}
