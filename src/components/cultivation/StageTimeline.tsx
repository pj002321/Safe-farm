import type { StageStep } from "@/features/cultivations/domain/stageTimeline";
import type { FruitCycle } from "@/shared/growth/fruitOrigin";

/**
 * ---------------------------------------------
 * [Feature]: 생육 단계 타임라인
 *
 * [Description]
 * - 전체 단계를 세로로 세우고 지금 단계를 가운데에 둔다. 진행률 막대 하나만
 *   보여 주면 "다음에 뭐가 오나"를 알 수 없어서다.
 * - **도달일을 실측과 추정으로 나눠 적는다.** 관측으로 확인한 날과 앞으로의
 *   추정을 같은 글씨로 쓰면 사용자가 추정을 사실로 읽는다.
 * - 지난 단계는 접어 둔다(`<details>`). 지금·다음 두 줄이 화면의 요점이고,
 *   지난 것은 물었을 때만 있으면 된다.
 * - **마지막 단계에 닿으면 그 뒤가 없다고 말한다.** 아무 말 없이 끝나면 사용자는
 *   "우리 계산이 틀렸다"고 읽는다. 자료가 없다고 적는 편이 정직하다.
 * - 서버 컴포넌트다. 상태도 브라우저 API 도 쓰지 않는다.
 * ---------------------------------------------
 */

export interface StageTimelineProps {
  steps: readonly StageStep[];
  /**
   * 과수의 한 해 주기. **과수가 아니면 null.**
   *
   * ⚠ 이것이 있으면 마지막 단계 뒤의 말이 달라진다. 과수는 한 해를 돌므로
   *   "마지막" 이 아니라 **"올해 수확이 끝났고 다음 기점에 다시 시작한다"** 다.
   */
  fruit?: FruitCycle | null;
}

/** `"YYYY-MM-DD"` → `"3월 25일"`. 화면에 연도는 안 적는다 — 해마다 같은 날이다. */
function mmDdKo(iso: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(iso);
  if (m === null) return iso;
  return `${Number(m[1])}월 ${Number(m[2])}일`;
}

/** 기점 낱말을 사람 말로. 모르는 값이 오면 그 말을 그대로 쓴다. */
function originKo(kind: string): string {
  if (kind === "발아") return "싹이 트면";
  if (kind === "개화") return "꽃이 피면";
  return `${kind} 때`;
}

const DOT: Record<StageStep["state"], string> = {
  done: "bg-good",
  current: "bg-accent ring-4 ring-accent/20",
  upcoming: "bg-border",
};

/**
 * 마스터 단계표의 끝에 적을 말. 닿기 전이면 `null` — 중간 단계에 붙으면 늘 있는 잔소리가 된다.
 *
 * 단계표가 **수확으로 끝나는지**로 말을 가른다. 실측(2026-09-20): 단계가 있는 숙기 114개 중
 * 96개는 수확류로 끝나고 18개는 중간에서 끊긴다(양파 → 줄기비대기, 무 → 뿌리비대기 …).
 * 끊긴 쪽은 **자료가 빠진 것**이고 수확으로 끝난 쪽은 **원래 거기가 끝**이다. 같은 말을 쓰면
 * 96개에서 거짓말이 된다.
 *
 * ⚠ 이름 글자로 가른다. 단계표에 "여기가 마지막인가" 를 뜻하는 칸이 없다.
 *   단계표가 고쳐지면(양파 수확기 추가) 이 줄은 저절로 안 보이게 된다.
 *
 * ⚠ **마스터 단계만 받는다.** 사용자 단계까지 넘기면 단계를 더할 때마다 이 말이 따라
 *   내려가며 방금 더한 줄을 가리켜 "여기도 자료가 없습니다" 를 반복한다.
 */
function afterLastKo(
  master: readonly StageStep[],
  fruit: FruitCycle | null | undefined,
): string | null {
  const last = master.at(-1);
  if (last === undefined || last.state === "upcoming") return null;

  // ★ 과수는 **끝이 아니라 한 바퀴**다 — 2026-09-20 (`교안_과수를_살린다.md`).
  //   crop_stages 는 기점~수확까지만 담고(겨울은 GDD 가 0이라 구간으로 못 잰다),
  //   수확 뒤는 다음 기점까지 기다리는 정상 상태다.
  //
  //   ⚠ 여기서 "마지막 단계입니다" 나 "자료가 없습니다" 를 쓰면 한 해의 절반을
  //     틀린 말로 덮는다. 실측(2026-09-20): 9월 20일에 15종 중 7종이 이미
  //     수확을 끝낸 상태였다(매실·블루베리·살구·자두·체리·포도·플럼코트).
  if (fruit != null) {
    const 다시 = `${mmDdKo(fruit.nextOriginOn)}쯤 ${originKo(fruit.originKind)} 다시 셉니다.`;
    return fruit.afterHarvest
      ? `올해 수확이 끝났습니다. ${다시}`
      : `수확이 이 해의 마지막 단계입니다. ${다시}`;
  }

  return last.nameKo.includes("수확")
    ? "마지막 단계입니다. 더 하실 일이 있으면 아래에서 단계를 더해 주세요."
    : "이 뒤 단계는 자료가 없습니다. 하신 일은 아래에서 단계로 더해 주세요.";
}

/** 화면 key. 사용자 단계는 `stageOrder` 가 없으므로 기록 id 를 쓴다. */
function stepKey(step: StageStep): string {
  return step.eventId ?? `master-${step.stageOrder}`;
}

function reachedKo(step: StageStep): string {
  if (step.reachedOn === null) return "도달일 미정";
  // 사용자 단계는 우리가 민 날이 아니라 사용자가 적은 날이다. "예상" 이라고 하면
  // 자기가 적어 넣은 날짜를 우리 추측으로 읽는다.
  if (step.source === "user") {
    return step.state === "upcoming"
      ? `${step.reachedOn} 예정`
      : step.reachedOn;
  }
  return step.reachedKind === "observed"
    ? `${step.reachedOn} 도달`
    : `${step.reachedOn} 예상`;
}

function Row({ step }: { step: StageStep }) {
  return (
    <li className="flex gap-3">
      <span className="flex flex-col items-center pt-1.5">
        <span className={`size-2.5 shrink-0 rounded-full ${DOT[step.state]}`} />
        <span className="mt-1 w-px flex-1 bg-border" />
      </span>

      <div className="flex-1 pb-4">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span
            className={
              step.state === "current"
                ? "font-semibold text-fg"
                : "text-fg-muted"
            }
          >
            {step.nameKo}
          </span>
          <span
            className={
              step.reachedKind === "estimated"
                ? "text-fg-subtle text-xs italic"
                : "text-fg-muted text-xs"
            }
          >
            {reachedKo(step)}
          </span>
          {step.source === "user" && (
            // 단계표에 없는 줄임을 밝힌다. 안 밝히면 다음 사람이 "양파 단계표에
            // 말림이 있다" 고 읽는다.
            <span className="text-fg-subtle text-xs">직접 더함</span>
          )}
        </div>

        {step.state === "current" && step.guideKo && (
          <p className="mt-1 text-fg-muted text-sm">{step.guideKo}</p>
        )}
      </div>
    </li>
  );
}

export function StageTimeline({ steps, fruit }: StageTimelineProps) {
  if (steps.length === 0) {
    return (
      <p className="text-fg-muted text-sm">
        단계표가 없어 생육 단계를 그릴 수 없습니다.
      </p>
    );
  }

  const master = steps.filter((step) => step.source === "master");
  const added = steps.filter((step) => step.source === "user");

  // 접는 것은 **마스터의 지난 단계뿐**이다. 사용자 단계는 지났어도 펼쳐 둔다 —
  // 방금 자기 손으로 더한 줄이 접힌 채로 나오면 저장이 안 된 걸로 읽는다.
  const done = master.filter((step) => step.state === "done");
  const rest = master.filter((step) => step.state !== "done");
  const afterLast = afterLastKo(master, fruit);

  return (
    <div className="flex flex-col gap-2">
      {done.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-fg-muted">
            지난 단계 {done.length}개
          </summary>
          <ul className="mt-3">
            {done.map((step) => (
              <Row key={stepKey(step)} step={step} />
            ))}
          </ul>
        </details>
      )}

      {rest.length > 0 && (
        <ul>
          {rest.map((step) => (
            <Row key={stepKey(step)} step={step} />
          ))}
        </ul>
      )}

      {/* 마스터와 사용자 단계 **사이**에 놓는다. 뒤에 두면 방금 더한 줄을 가리키며
          "이 뒤는 자료가 없습니다" 라고 말하는 꼴이 된다.
          점·선도 잇지 않는다 — 단계가 아니라 단계가 **없다는** 말이라, 같은 줄로
          그리면 사용자가 단계 하나로 읽는다 */}
      {afterLast !== null && (
        <p className="pl-[1.4rem] text-fg-subtle text-xs">{afterLast}</p>
      )}

      {added.length > 0 && (
        <ul>
          {added.map((step) => (
            <Row key={stepKey(step)} step={step} />
          ))}
        </ul>
      )}
    </div>
  );
}
