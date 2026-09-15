import type { SprayHour, SprayWindow } from "@/features/report/domain/drone";

/**
 * ---------------------------------------------
 * [Feature]: 드론 방제 적기 띠
 *
 * [Description]
 * - 하루 24시간을 가로 막대로 펴고, 약 칠 수 있는 시간대를 칠한다. 표로 보여주면
 *   "몇 시부터 몇 시까지"가 머리에 안 들어온다 — 농민이 알고 싶은 건 덩어리다.
 * - 해 뜸·짐 시각을 세로선으로 얹는다. 방제 적기가 왜 아침에 몰리는지가 그림으로
 *   설명된다.
 * - **막힌 이유를 목록으로 함께 적는다.** 색칠 안 된 구간만 보여주면 사용자가
 *   언제 다시 봐야 할지 모른다.
 * - ⚠️ 기준값이 잠정치임을 화면에 밝힌다. 확인 전까지 이 수치를 확정처럼 보이게
 *   두면, 그대로 믿고 방제하다 약해가 날 수 있다.
 *
 * [Usage]
 * ```tsx
 * <SprayWindows hours={REPORT.spray.hours} windows={REPORT.spray.windows}
 *   sunriseKo="06:07" sunsetKo="18:38" />
 * ```
 * ---------------------------------------------
 */

interface SprayWindowsProps {
  hours: readonly SprayHour[];
  windows: readonly SprayWindow[];
  sunriseKo: string;
  sunsetKo: string;
}

/** `"06:07"` → 하루(24시간) 중 위치 0~1. 막대에 세로선을 얹는 데 쓴다. */
function dayRatio(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h * 60 + m) / (24 * 60);
}

export function SprayWindows({
  hours,
  windows,
  sunriseKo,
  sunsetKo,
}: SprayWindowsProps) {
  // 같은 이유가 연달아 나오면 목록이 소음이 된다(05시·06시 둘 다 "해 뜨기 전").
  // 이유별로 첫 시간대만 남겨 "언제부터 왜 막혔는지"만 전달한다.
  const seen = new Set<string>();
  const blocked = hours.filter((h) => {
    if (h.ok || h.blockedByKo.length === 0) return false;
    const key = h.blockedByKo.join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <b className="font-semibold text-[0.95rem] text-fg">
          드론으로 약 칠 만한 때
        </b>
        <span className="font-mono text-[0.7rem] text-fg-subtle">
          바람 3m/s 이하 · 습도 60% 이상
        </span>
      </div>

      <div className="relative mt-3 h-6 overflow-hidden rounded-md bg-surface-2">
        {/* 가능 구간 */}
        {windows.map((w) => (
          <span
            className="absolute inset-y-0 rounded-[3px] bg-telemetry/70"
            key={`${w.startHour}-${w.endHour}`}
            style={{
              left: `${(w.startHour / 24) * 100}%`,
              // endHour 는 "포함"이므로 한 시간을 더해야 그 시간대가 칠해진다.
              width: `${((w.endHour + 1 - w.startHour) / 24) * 100}%`,
            }}
          />
        ))}
        {/* 해 뜸·짐 */}
        {[sunriseKo, sunsetKo].map((t) => (
          <span
            aria-hidden="true"
            className="absolute inset-y-0 w-px bg-border-strong"
            key={t}
            style={{ left: `${dayRatio(t) * 100}%` }}
          />
        ))}
      </div>

      <div className="mt-1 flex justify-between font-mono text-[0.65rem] text-fg-subtle">
        <span>0시</span>
        <span>6시</span>
        <span>12시</span>
        <span>18시</span>
        <span>24시</span>
      </div>

      <p className="mt-3 border-telemetry border-l-2 pl-3 text-[0.85rem] text-fg-muted leading-relaxed">
        {windows.length > 0 ? (
          <>
            오늘은{" "}
            <b className="font-semibold text-fg">
              {windows
                .map((w) => `${w.startHour}시부터 ${w.endHour + 1}시 전까지`)
                .join(", ")}
            </b>
            가 좋습니다. 이슬이 남아 있고 바람이 잔잔합니다.
          </>
        ) : (
          "오늘은 약 치기 어렵습니다. 아래 이유를 확인해 주세요."
        )}
      </p>

      {blocked.length > 0 && (
        <ul className="mt-2 space-y-1 border-earth border-l-2 pl-3 text-[0.8rem] text-fg-subtle">
          {blocked.slice(0, 3).map((h) => (
            <li key={h.hour}>
              <span className="font-mono tabular-nums">
                {String(h.hour).padStart(2, "0")}시
              </span>{" "}
              — {h.blockedByKo.join(" · ")}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-[0.75rem] text-fg-subtle leading-relaxed">
        ⚠️ 위 기준값은 현장 관행을 옮긴 <b>잠정치</b>입니다. 실제 방제하시는 분께
        확인이 필요합니다.
      </p>
    </div>
  );
}
