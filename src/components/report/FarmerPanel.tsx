"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/shared/Badge";
import { Card } from "@/components/shared/Card";
import {
  buildAdvice,
  CABBAGE,
  REPORT,
} from "@/features/report/domain/reportData";
import type { RevealId } from "@/features/report/domain/timeline";
import { GrowthGauge } from "@/components/shared/GrowthGauge";
import { SprayWindows } from "./SprayWindows";
import { TypeOut } from "./TypeOut";

/**
 * ---------------------------------------------
 * [Feature]: 농민이 보는 화면 (왼쪽)
 *
 * [Description]
 * - 오른쪽 추적 패널이 한 단계 끝낼 때마다 여기서 해당 조각이 열린다. 두 패널이
 *   같은 `open` 집합을 보므로 "저 계산이 이 문장을 만들었다"가 눈으로 이어진다.
 * - **조각이 닫혀 있을 때는 자리만 비워 두지 않는다.** 레이아웃이 계속 튀면 읽기가
 *   어려우므로, 열리기 전에는 아예 렌더하지 않고 나타날 때 아래로 밀어낸다.
 * - 마지막 `advice` 만 타이핑한다. 전부 타이핑하면 화면이 산만하고, 무엇보다
 *   이 데모의 요점(앞에서 숫자가 다 정해지고 마지막에 문장만 만들어진다)이 흐려진다.
 *
 * [Usage]
 * ```tsx
 * <FarmerPanel open={revealedAt(TIMELINE, completed)} />
 * ```
 * ---------------------------------------------
 */

interface FarmerPanelProps {
  open: ReadonlySet<RevealId>;
}

export function FarmerPanel({ open }: FarmerPanelProps) {
  const { growth, weather, hazards, spray, station } = REPORT;
  const advice = buildAdvice();

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {open.has("hazard") &&
        hazards.map((hazard) => (
          <Section key={hazard.id}>
            <div className="flex gap-3 rounded-xl border border-caution/30 bg-caution/10 px-4 py-3.5">
              <span aria-hidden="true" className="text-lg leading-tight">
                ☀
              </span>
              <div className="min-w-0">
                <b className="block font-semibold text-[0.95rem] text-fg">
                  {hazard.becauseKo}
                </b>
                <p className="mt-1 text-[0.85rem] text-fg-muted leading-relaxed">
                  배추가 한창 자라는 때인데 땅이 마르고 있어요.{" "}
                  {hazard.actionsKo[0]}부터 해보세요.
                </p>
                <p className="mt-1.5 font-mono text-[0.68rem] text-fg-subtle">
                  근거 · {hazard.sourceKo}
                </p>
              </div>
            </div>
          </Section>
        ))}

      {open.has("plot") && (
        <Section>
          <Card padding="md">
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-accent-subtle text-[0.7rem] text-accent"
              >
                밭
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-[1.05rem] text-fg">
                  {CABBAGE.plotNameKo}
                </p>
                <p className="font-mono text-[0.7rem] text-fg-subtle">
                  {station.latitude}, {station.longitude} · 해발{" "}
                  {station.elevationM}m · {CABBAGE.areaKo}
                </p>
              </div>
              {open.has("history") && (
                <Badge size="sm" tone="telemetry">
                  실측 연결됨
                </Badge>
              )}
            </div>

            {open.has("gauge") && (
              <div className="mt-5 border-border border-t pt-5">
                <GrowthGauge
                  dayLabelKo={`씨뿌린 지 ${CABBAGE.daysSinceSowing}일째`}
                  footEndKo={
                    growth.daysToHeading === null
                      ? "결구 시기 추정 불가"
                      : `결구까지 ${growth.daysToHeading}일`
                  }
                  footStartKo="씨뿌림 8/25"
                  markLabelKo="결구 시작"
                  markRatio={growth.headingMark}
                  revealed
                  target={CABBAGE.totalTargetGdd}
                  value={growth.accumulatedGdd}
                />
              </div>
            )}

            {open.has("advice") && (
              <div className="mt-5 flex flex-col gap-2.5 border-border border-t pt-5">
                {advice.map((line, index) => (
                  <p
                    className={`text-[0.9rem] leading-relaxed ${
                      line.tone === "todo"
                        ? "border-telemetry border-l-2 pl-3 text-fg"
                        : line.tone === "warn"
                          ? "border-caution border-l-2 pl-3 text-fg-muted"
                          : "text-fg"
                    }`}
                    key={line.text}
                  >
                    <TypeOut
                      // 앞 줄이 다 찍힌 뒤에 시작하도록 줄마다 지연을 준다.
                      // 정확한 체이닝(onDone)보다 단순하고, 한 줄이 길어져도
                      // 다음 줄이 겹쳐 보이지 않을 만큼의 간격이다.
                      startDelayMs={index * 700}
                      text={line.text}
                    />
                  </p>
                ))}
              </div>
            )}
          </Card>
        </Section>
      )}

      {open.has("today") && (
        <Section>
          <Card padding="md" title="오늘 배추밭">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              <Metric
                labelKo="기온"
                valueKo={`${weather.todayMinC.toFixed(1)} – ${weather.todayMaxC.toFixed(1)}℃`}
              />
              <Metric
                labelKo="이레 강수"
                valueKo={`${weather.rain7Mm.toFixed(1)}mm`}
              />
              <Metric labelKo="해 뜸" valueKo={weather.sunriseKo} />
              <Metric labelKo="해 짐" valueKo={weather.sunsetKo} />
            </dl>

            {open.has("drone") && (
              <div className="mt-5 border-border border-t pt-5">
                <SprayWindows
                  hours={spray.hours}
                  sunriseKo={weather.sunriseKo}
                  sunsetKo={weather.sunsetKo}
                  windows={spray.windows}
                />
              </div>
            )}
          </Card>
        </Section>
      )}
    </div>
  );
}

/** 등장 래퍼. shared/Reveal 은 스크롤 기반이라 재생 기반인 여기엔 맞지 않는다. */
function Section({ children }: { children: ReactNode }) {
  return <div className="animate-rise">{children}</div>;
}

function Metric({ labelKo, valueKo }: { labelKo: string; valueKo: string }) {
  return (
    <div>
      <dt className="font-mono text-[0.65rem] text-fg-subtle uppercase tracking-[0.12em]">
        {labelKo}
      </dt>
      <dd className="mt-1 font-mono text-[0.9rem] text-fg tabular-nums">
        {valueKo}
      </dd>
    </div>
  );
}
