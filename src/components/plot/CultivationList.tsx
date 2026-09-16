import { SproutIcon } from "@/components/icons";
import { Badge } from "@/components/shared/Badge";
import { Button } from "@/components/shared/Button";
import { EmptyState } from "@/components/shared/EmptyState";
import { GrowthGauge } from "@/components/shared/GrowthGauge";
import {
  type CultivationCard,
  type CultivationStatus,
  cardTitle,
} from "@/features/cultivations/domain/cultivationCard";
import type { GrowthGauge as Gauge } from "@/features/cultivations/domain/growthGauge";
import type { PlotGrowth } from "@/features/cultivations/growthStore";

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
 *
 * [Usage]
 * ```tsx
 * <CultivationList cards={cards} growth={growth} onHarvest={…} onDelete={…} />
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
}: CultivationListProps) {
  if (cards.length === 0) {
    return (
      <EmptyState
        actionHref="/plots/new"
        actionKo="작물 심기"
        bodyKo="심은 작물을 알려 주시면 그 자리의 기상 관측으로 생육 단계를 계산해 드립니다."
        icon={<SproutIcon />}
        titleKo="아직 심은 작물이 없습니다"
      />
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
}: {
  plotId: string;
  card: CultivationCard;
  gauge: Gauge | null;
  today: string;
  onHarvest: (formData: FormData) => Promise<void>;
  onDelete: (formData: FormData) => Promise<void>;
}) {
  const title = cardTitle(card);
  const days = card.sowingDate ? daysSince(card.sowingDate, today) : null;
  const maturity = card.maturityType
    ? (MATURITY_LABEL[card.maturityType] ?? card.maturityType)
    : null;

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
          days !== null && days >= 0 ? `D+${days}` : null,
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
        {card.status === "GROWING" && (
          <form action={onHarvest}>
            <input name="plotId" type="hidden" value={plotId} />
            <input name="cultivationId" type="hidden" value={card.id} />
            <Button size="sm" type="submit" variant="outline">
              수확 완료
            </Button>
          </form>
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
              <Button size="sm" type="submit" variant="danger">
                삭제합니다
              </Button>
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
